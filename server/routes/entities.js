import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { notificar, verificarConstanciaAutomatica } from '../lib/gestion.js';

const router = Router();

// Mapeo de nombres de entidades a tablas (lista blanca: solo estas existen)
const entityMap = {
  'User': 'users',
  'Actividades': 'actividades',
  'Asignaciones': 'asignaciones',
  'Registros_QR': 'registros_qr',
  'Evidencias': 'evidencias',
  'Bonos': 'bonos',
  'Incidencias': 'incidencias',
  'Horarios_Clase': 'horarios_clase',
  'Eventos': 'eventos',
  'Constancias': 'constancias',
  'Encuestas': 'encuestas',
  'Respuestas_Encuesta': 'respuestas_encuesta',
  'Evaluaciones_Alumno': 'evaluaciones_alumno',
  'Materiales_Recibidos': 'materiales_recibidos',
  'Electronicos_Reciclados': 'electronicos_reciclados',
  'Salidas_Materiales': 'salidas_materiales',
  'Stock_Minimo': 'stock_minimo',
  'Codigos_QR': 'codigos_qr',
  'Pases_Lista': 'pases_lista',
  'Respuestas_Pases_Lista': 'respuestas_pases_lista',
  'Invitaciones': 'invitaciones',
  'Configuracion_Sistema': 'configuracion_sistema',
  'Bitacora_Auditoria': 'bitacora_auditoria',
  'Comentarios_Evidencia': 'comentarios_evidencia',
  'Notificaciones': 'notificaciones',
  'Historial_Areas': 'historial_areas',
  'Checklist_Bodega': 'checklist_bodega',
  'Reportes_Huella': 'reportes_huella',
  'Ajustes_Horas': 'ajustes_horas',
  'Ventas': 'ventas',
  'Categorias_Material': 'categorias_material'
};

// ===== Permisos por rol (según DOCUMENTO_ROLES) =====
// 'admin' todo; 'encargado' gestión de su área; participantes (servicio_social/voluntario) solo lo suyo
const WRITE_ADMIN_ONLY = new Set(['User', 'Bonos', 'Configuracion_Sistema', 'Invitaciones', 'Codigos_QR', 'Stock_Minimo', 'Ajustes_Horas', 'Categorias_Material']);
const WRITE_ADMIN_ENCARGADO = new Set(['Actividades', 'Eventos', 'Constancias', 'Encuestas', 'Evaluaciones_Alumno', 'Pases_Lista', 'Reportes_Huella']);
const BODEGA_CREATE = new Set(['Materiales_Recibidos', 'Electronicos_Reciclados', 'Salidas_Materiales']); // crear: admin/encargado; editar/borrar: solo admin
const PARTICIPANT_OWN = new Set(['Asignaciones', 'Horarios_Clase', 'Evidencias', 'Respuestas_Encuesta', 'Respuestas_Pases_Lista', 'Registros_QR', 'Comentarios_Evidencia', 'Notificaciones', 'Checklist_Bodega']); // el participante solo toca lo propio
const READ_ADMIN_ONLY = new Set(['Invitaciones', 'Bitacora_Auditoria', 'Codigos_QR']);
const READ_STAFF_ONLY = new Set(['Historial_Areas', 'Ventas']); // solo admin/encargado pueden leerlo
const NO_CLIENT_WRITE = new Set(['Historial_Areas']); // solo el servidor escribe (hooks internos)

// Cache de columnas reales por tabla (evita SQL injection en identificadores
// y errores por columnas inexistentes, ej. updated_date)
const columnCache = {};
function validColumns(table) {
  if (!columnCache[table]) {
    columnCache[table] = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  }
  return columnCache[table];
}

// Rol fresco desde la BD (el JWT puede estar desactualizado si cambiaron el rol)
function getMe(req) {
  return db.prepare('SELECT id, role, area_encargada FROM users WHERE id = ?').get(req.user.id) || null;
}

function esAdmin(me) { return me?.role === 'admin'; }
function esAdminOEncargado(me) { return me?.role === 'admin' || me?.role === 'encargado'; }

// better-sqlite3 no acepta booleanos JS: convertir a 1/0
function coerce(value) {
  if (value === true) return 1;
  if (value === false) return 0;
  if (value === undefined) return null;
  return value;
}

function stripPassword(rows) {
  const clean = (r) => { if (r && 'password' in r) { const { password, ...rest } = r; return rest; } return r; };
  return Array.isArray(rows) ? rows.map(clean) : clean(rows);
}

function getTable(req, res) {
  const table = entityMap[req.params.entity];
  if (!table) {
    res.status(404).json({ error: 'Entidad desconocida' });
    return null;
  }
  return table;
}

// Verifica permiso de escritura; devuelve true si autorizado
function checkWrite(req, res, entity, existingRow) {
  const me = getMe(req);
  if (!me) { res.status(401).json({ error: 'No autorizado' }); return false; }

  if (NO_CLIENT_WRITE.has(entity)) {
    res.status(403).json({ error: 'Esta entidad solo la escribe el sistema' });
    return false;
  }
  if (esAdmin(me)) return true;

  // Personal de bodega (Bodega/CU1/CU2) solo registra ENTRADAS:
  // las salidas y las ventas las hace el administrador.
  const AREAS_BODEGA = ['Bodega', 'CU1', 'CU2'];
  if ((entity === 'Salidas_Materiales' || entity === 'Ventas') && existingRow === undefined
      && me.role === 'encargado' && AREAS_BODEGA.includes(me.area_encargada)) {
    res.status(403).json({ error: 'El personal de bodega solo puede registrar entradas de material. Las salidas y ventas las registra el administrador.' });
    return false;
  }

  if (WRITE_ADMIN_ONLY.has(entity)) {
    res.status(403).json({ error: 'Solo el administrador puede modificar esto' });
    return false;
  }
  if (WRITE_ADMIN_ENCARGADO.has(entity) || BODEGA_CREATE.has(entity)) {
    if (!esAdminOEncargado(me)) {
      res.status(403).json({ error: 'Solo admin o encargado' });
      return false;
    }
    // En bodega, editar/borrar es solo admin (encargado solo crea)
    if (BODEGA_CREATE.has(entity) && existingRow !== undefined) {
      res.status(403).json({ error: 'Solo el administrador puede editar o eliminar registros de bodega' });
      return false;
    }
    return true;
  }
  if (entity === 'Incidencias') {
    // Crear: admin/encargado; resolver (update) y borrar: solo admin
    if (existingRow !== undefined) {
      res.status(403).json({ error: 'Solo el administrador puede resolver o eliminar incidencias' });
      return false;
    }
    if (!esAdminOEncargado(me)) {
      res.status(403).json({ error: 'Solo admin o encargado pueden reportar incidencias' });
      return false;
    }
    return true;
  }
  if (entity === 'Bitacora_Auditoria') {
    // Cualquiera autenticado puede crear entradas de bitácora; solo admin borra/edita
    if (existingRow !== undefined) {
      res.status(403).json({ error: 'La bitácora es inmutable' });
      return false;
    }
    return true;
  }
  if (entity === 'Ventas') {
    // Crear: admin/encargado; editar o borrar (revierte stock): solo admin
    if (existingRow !== undefined && !esAdmin(me)) {
      res.status(403).json({ error: 'Solo el administrador puede editar o eliminar ventas' });
      return false;
    }
    if (!esAdminOEncargado(me)) {
      res.status(403).json({ error: 'Solo admin o encargado pueden registrar ventas' });
      return false;
    }
    return true;
  }
  if (PARTICIPANT_OWN.has(entity)) {
    // Dueño del registro o admin/encargado
    if (esAdminOEncargado(me)) return true;
    if (existingRow && existingRow.usuario === me.id) return true;
    if (existingRow === undefined) return true; // creación: se fuerza usuario=self más abajo
    res.status(403).json({ error: 'Solo puedes modificar tus propios registros' });
    return false;
  }
  // Cualquier otra entidad: admin/encargado
  if (!esAdminOEncargado(me)) {
    res.status(403).json({ error: 'Sin permiso' });
    return false;
  }
  return true;
}

// LIST - GET /api/:entity
router.get('/:entity', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  const me = getMe(req);
  if (READ_ADMIN_ONLY.has(req.params.entity) && !esAdmin(me)) {
    return res.status(403).json({ error: 'Solo el administrador' });
  }
  if (READ_STAFF_ONLY.has(req.params.entity) && !esAdminOEncargado(me)) {
    return res.status(403).json({ error: 'Solo admin o encargado' });
  }

  const cols = validColumns(table);
  const { sort, limit, ...filters } = req.query;

  try {
    let query = `SELECT * FROM ${table}`;
    const params = [];

    // Aplicar filtros (solo columnas reales → sin inyección SQL)
    const filterKeys = Object.keys(filters).filter(k => cols.has(k));
    if (filterKeys.length > 0) {
      const conditions = filterKeys.map(k => {
        params.push(filters[k]);
        return `${k} = ?`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Ordenar (columna validada)
    if (sort) {
      const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
      const column = sort.startsWith('-') ? sort.slice(1) : sort;
      if (cols.has(column)) {
        query += ` ORDER BY ${column} ${direction}`;
      } else if (cols.has('created_date')) {
        query += ` ORDER BY created_date DESC`;
      }
    } else if (cols.has('created_date')) {
      query += ` ORDER BY created_date DESC`;
    }

    if (limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(limit) || 100);
    }

    let rows = db.prepare(query).all(...params);
    if (table === 'users') rows = stripPassword(rows);
    res.json(rows);
  } catch (error) {
    console.error('LIST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET ONE - GET /api/:entity/:id
router.get('/:entity/:id', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  const me = getMe(req);
  if (READ_ADMIN_ONLY.has(req.params.entity) && !esAdmin(me)) {
    return res.status(403).json({ error: 'Solo el administrador' });
  }
  if (READ_STAFF_ONLY.has(req.params.entity) && !esAdminOEncargado(me)) {
    return res.status(403).json({ error: 'Solo admin o encargado' });
  }

  try {
    let row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    if (table === 'users') row = stripPassword(row);
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE - POST /api/:entity
router.post('/:entity', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;
  if (!checkWrite(req, res, req.params.entity, undefined)) return;

  const cols = validColumns(table);
  const data = { ...req.body };

  // Participantes: el registro siempre queda a su nombre
  const me = getMe(req);
  if (PARTICIPANT_OWN.has(req.params.entity) && !esAdminOEncargado(me)) {
    data.usuario = me.id;
  }
  // Evidencias de participante siempre nacen pendientes (sin auto-aprobarse)
  if (req.params.entity === 'Evidencias' && !esAdminOEncargado(me)) {
    data.estado_evidencia = 'pendiente';
    delete data.aprobado_por;
    delete data.comentario_revision;
    delete data.bono_horas;
    delete data.bono_motivo;
  }
  // Comentarios: el autor es siempre quien está autenticado, con su nombre real
  if (req.params.entity === 'Comentarios_Evidencia') {
    data.usuario = me.id;
    const autor = db.prepare('SELECT nombre_completo, full_name, email FROM users WHERE id = ?').get(me.id);
    data.usuario_nombre = autor?.nombre_completo || autor?.full_name || autor?.email || 'Usuario';
    if (!data.evidencia || !data.comentario) {
      return res.status(400).json({ error: 'Faltan evidencia y comentario' });
    }
  }

  try {
    const id = data.id || uuidv4();

    // Folio automático y consecutivo para reportes de huella de carbono: HC-<año>-####
    if (req.params.entity === 'Reportes_Huella' && !data.folio) {
      const anio = new Date().getFullYear();
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM reportes_huella WHERE folio LIKE ?`).get(`HC-${anio}-%`);
      data.folio = `HC-${anio}-${String(n + 1).padStart(4, '0')}`;
    }

    // Solo columnas que existen en la tabla
    const fields = Object.keys(data).filter(f => cols.has(f) && f !== 'id');
    const values = fields.map(f => coerce(data[f]));
    fields.unshift('id');
    values.unshift(id);

    const placeholders = fields.map(() => '?').join(', ');
    db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);

    let row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (table === 'users') row = stripPassword(row);

    // ===== Hooks de gestión de personal =====
    if (req.params.entity === 'Asignaciones' && row?.usuario) {
      const act = row.actividad ? db.prepare('SELECT nombre FROM actividades WHERE id = ?').get(row.actividad) : null;
      notificar(row.usuario, 'Nueva actividad asignada', `Te asignaron: ${act?.nombre || 'una actividad'}. Revisa los detalles.`, '/alumno/actividades');
    }
    if (req.params.entity === 'Bonos' && row?.usuario) {
      notificar(row.usuario, `+${row.horas || 0} h de premio`, row.motivo || 'Se te asignaron horas de premio.', '/alumno');
      verificarConstanciaAutomatica(row.usuario);
    }
    if (req.params.entity === 'Ajustes_Horas' && row?.usuario) {
      const mins = Math.round(row.minutos || 0);
      const signo = mins >= 0 ? '+' : '-';
      notificar(row.usuario, `Ajuste de horas (${signo}${Math.abs(mins)} min)`, row.motivo || 'El administrador ajustó tus horas.', '/alumno');
      verificarConstanciaAutomatica(row.usuario);
    }
    if (req.params.entity === 'Comentarios_Evidencia' && row?.evidencia) {
      const ev = db.prepare('SELECT usuario, aprobado_por, descripcion FROM evidencias WHERE id = ?').get(row.evidencia);
      if (ev) {
        // Si comenta alguien distinto del dueño, avisar al dueño; si comenta el dueño, avisar al revisor
        if (row.usuario !== ev.usuario) {
          notificar(ev.usuario, 'Nuevo comentario en tu evidencia', row.comentario?.slice(0, 120) || '', '/alumno/evidencias');
        } else if (ev.aprobado_por && ev.aprobado_por !== ev.usuario) {
          notificar(ev.aprobado_por, 'El alumno respondió en una evidencia', (row.comentario || '').slice(0, 120), null);
        }
      }
    }

    res.status(201).json(row);
  } catch (error) {
    console.error('CREATE error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE - PUT /api/:entity/:id
router.put('/:entity/:id', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  if (!checkWrite(req, res, req.params.entity, existing)) return;

  const cols = validColumns(table);
  const data = { ...req.body };

  // Un participante nunca puede cambiar el dueño ni auto-aprobarse evidencias
  const me = getMe(req);
  if (!esAdminOEncargado(me)) {
    delete data.usuario;
    delete data.role;
    if (req.params.entity === 'Evidencias') {
      // Al corregir, la evidencia vuelve sola a revisión (nunca se auto-aprueba)
      data.estado_evidencia = 'pendiente';
      delete data.aprobado_por;
      delete data.comentario_revision;
      delete data.bono_horas;
      delete data.bono_motivo;
    }
    if (req.params.entity === 'Comentarios_Evidencia') {
      // Un comentario solo puede editar su texto, no su autor ni su evidencia
      delete data.usuario;
      delete data.usuario_nombre;
      delete data.evidencia;
    }
    if (req.params.entity === 'Registros_QR') {
      return res.status(403).json({ error: 'Los fichajes se cierran escaneando el QR de salida' });
    }
  }

  try {
    // Solo columnas reales; updated_date solo si la tabla la tiene
    const fields = Object.keys(data).filter(f => cols.has(f) && f !== 'id');
    if (fields.length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => coerce(data[f]));
    values.push(req.params.id);

    const updatedClause = cols.has('updated_date') ? `, updated_date = datetime('now')` : '';
    db.prepare(`UPDATE ${table} SET ${setClause}${updatedClause} WHERE id = ?`).run(...values);

    let row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (table === 'users') row = stripPassword(row);

    // ===== Hooks de gestión de personal =====
    if (table === 'users') {
      // Historial de cambios de área y rol
      for (const campo of ['area_asignada', 'area_encargada', 'role']) {
        if (campo in req.body && String(existing[campo] ?? '') !== String(row[campo] ?? '')) {
          db.prepare(`INSERT INTO historial_areas (id, usuario, campo, valor_anterior, valor_nuevo, cambiado_por) VALUES (?, ?, ?, ?, ?, ?)`)
            .run(uuidv4(), row.id, campo, String(existing[campo] ?? ''), String(row[campo] ?? ''), me.id);
        }
      }
      // Aviso de baja/reactivación
      if ('archivado' in req.body && Number(existing.archivado) !== Number(row.archivado)) {
        if (Number(row.archivado) === 1) {
          notificar(row.id, 'Tu cuenta fue dada de baja', row.motivo_baja ? `Motivo: ${row.motivo_baja}` : 'Contacta al administrador para más información.', null);
        } else {
          notificar(row.id, 'Tu cuenta fue reactivada', 'Ya puedes seguir fichando y subiendo evidencias.', '/alumno');
        }
      }
    }
    if (req.params.entity === 'Evidencias' && row?.usuario && existing.estado_evidencia !== row.estado_evidencia) {
      const avisos = {
        aprobada: ['Evidencia aprobada ✅', 'Tu evidencia fue aprobada.'],
        rechazada: ['Evidencia rechazada', row.comentario_revision ? `Motivo: ${row.comentario_revision}` : 'Fue rechazada.'],
        regresada: ['Evidencia regresada para corrección', row.comentario_revision ? `Corrige: ${row.comentario_revision}` : 'Debes corregirla y reenviarla.'],
      };
      const aviso = avisos[row.estado_evidencia];
      if (aviso) notificar(row.usuario, aviso[0], aviso[1], '/alumno/evidencias');
    }
    if (req.params.entity === 'Registros_QR' && !Number(existing.validado) && Number(row.validado) === 1) {
      notificar(row.usuario, 'Fichaje validado', `Tu fichaje del ${row.fecha} (${row.horas || 0} h) ya cuenta para tu meta.`, '/alumno');
      verificarConstanciaAutomatica(row.usuario);
    }

    res.json(row);
  } catch (error) {
    console.error('UPDATE error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE - DELETE /api/:entity/:id
router.delete('/:entity/:id', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;

  const existing = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'No encontrado' });
  if (!checkWrite(req, res, req.params.entity, existing)) return;

  // Participante solo borra evidencias aún pendientes
  const me = getMe(req);
  if (req.params.entity === 'Evidencias' && !esAdminOEncargado(me) && existing.estado_evidencia !== 'pendiente') {
    return res.status(403).json({ error: 'Solo puedes eliminar evidencias pendientes' });
  }

  try {
    // Al eliminar una venta se revierte el stock: se borra la salida ligada
    if (req.params.entity === 'Ventas' && existing.salida) {
      try { db.prepare('DELETE FROM salidas_materiales WHERE id = ?').run(existing.salida); } catch {}
    }
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// BULK CREATE - POST /api/:entity/bulk
router.post('/:entity/bulk', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;
  if (!checkWrite(req, res, req.params.entity, undefined)) return;

  const items = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Se esperaba un array' });
  }

  const cols = validColumns(table);

  try {
    const created = [];
    for (const raw of items) {
      const data = { ...raw };
      const id = data.id || uuidv4();
      const fields = Object.keys(data).filter(f => cols.has(f) && f !== 'id');
      const values = fields.map(f => coerce(data[f]));
      fields.unshift('id');
      values.unshift(id);

      const placeholders = fields.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);

      let row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      if (table === 'users') row = stripPassword(row);
      created.push(row);
    }
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE MANY - PUT /api/:entity/bulk
router.put('/:entity/bulk', authMiddleware, (req, res) => {
  const table = getTable(req, res);
  if (!table) return;
  if (!checkWrite(req, res, req.params.entity, {})) return;

  const cols = validColumns(table);
  const { filter, $set } = req.body;

  try {
    const fields = Object.keys($set || {}).filter(f => cols.has(f));
    if (fields.length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => coerce($set[f]));

    let query = `UPDATE ${table} SET ${setClause}`;
    if (cols.has('updated_date')) query += `, updated_date = datetime('now')`;

    if (filter && Object.keys(filter).length > 0) {
      const conditions = Object.keys(filter)
        .filter(k => cols.has(k))
        .map(k => {
          values.push(filter[k]);
          return `${k} = ?`;
        });
      if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const result = db.prepare(query).run(...values);
    res.json({ updated: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
