import { Router } from 'express';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Helper para obtener hora actual de México
function ahoraMexico() {
  const now = new Date();
  const mexicoTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const hh = String(mexicoTime.getHours()).padStart(2, '0');
  const mm = String(mexicoTime.getMinutes()).padStart(2, '0');
  const hora = `${hh}:${mm}`;
  const yyyy = mexicoTime.getFullYear();
  const mo = String(mexicoTime.getMonth() + 1).padStart(2, '0');
  const dd = String(mexicoTime.getDate()).padStart(2, '0');
  const fecha = `${yyyy}-${mo}-${dd}`;
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const diaSemana = dias[mexicoTime.getDay()];
  const minutos = mexicoTime.getHours() * 60 + mexicoTime.getMinutes();
  return { hora, fecha, diaSemana, minutos, iso: mexicoTime.toISOString() };
}

function aMinutos(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

// ProcesarFichajeQR
router.post('/ProcesarFichajeQR', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { asignacion_id } = req.body;
    if (!asignacion_id) return res.status(400).json({ error: 'Falta asignacion_id' });

    const { hora, fecha, diaSemana, minutos } = ahoraMexico();
    const ROLES_PARTICIPANTE = ['voluntario', 'servicio_social'];
    const esParticipante = ROLES_PARTICIPANTE.includes(user.role);

    if (!esParticipante) {
      const config = db.prepare('SELECT * FROM configuracion_sistema LIMIT 1').get();
      const apertura = config?.hora_apertura || '08:00';
      const cierre = config?.hora_cierre || '18:00';
      const diasLaborales = config?.dias_laborales || 'Lunes,Martes,Miércoles,Jueves,Viernes';
      const TOLERANCIA_MIN = config?.tolerancia_minutos || 15;

      const diasArr = diasLaborales.split(',').map(d => d.trim());
      const esDiaLaboral = diasArr.includes(diaSemana);
      const minApertura = aMinutos(apertura);
      const minCierre = aMinutos(cierre);
      const dentroDeHorario = esDiaLaboral && minApertura != null && minCierre != null &&
        minutos >= minApertura - TOLERANCIA_MIN && minutos <= minCierre;

      if (!dentroDeHorario) {
        const descripcion = esDiaLaboral
          ? `Fichaje fuera de horario laboral (${diaSemana} ${hora}). Horario autorizado: ${apertura}–${cierre}.`
          : `Fichaje en día no laboral (${diaSemana} ${hora}).`;
        const incidencia = db.prepare(`
          INSERT INTO incidencias (id, tipo_incidencia, usuario_afectado, asignacion, descripcion, prioridad, estado_incidencia, creado_por)
          VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)
        `).run('falta', user.id, asignacion_id, descripcion, 'media', 'reportada', user.id);
        return res.json({ tipo: 'incidencia', incidencia: { id: incidencia.lastInsertRowid } });
      }
    }

    // Buscar clase coincidente
    let claseInfo = null;
    const horarios = db.prepare(`
      SELECT * FROM horarios_clase WHERE usuario = ? AND dia_semana = ? ORDER BY hora_inicio LIMIT 50
    `).all(user.id, diaSemana);
    const coincidente = horarios.find(h => {
      const ini = aMinutos(h.hora_inicio);
      const fin = aMinutos(h.hora_fin);
      if (ini == null || fin == null) return false;
      return minutos >= ini - 15 && minutos <= fin;
    });
    if (coincidente) claseInfo = coincidente.materia || null;

    const registro = db.prepare(`
      INSERT INTO registros_qr (id, usuario, asignacion, fecha, hora_entrada, estado_registro)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
    `).run(user.id, asignacion_id, fecha, hora, 'abierto');

    const row = db.prepare('SELECT * FROM registros_qr WHERE rowid = ?').get(registro.lastInsertRowid);
    res.json({ tipo: 'presente', registro: row, clase: claseInfo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// RegistrarSalidaFichaje
router.post('/RegistrarSalidaFichaje', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { registro_id } = req.body;
    if (!registro_id) return res.status(400).json({ error: 'Falta registro_id' });

    const registro = db.prepare('SELECT * FROM registros_qr WHERE id = ?').get(registro_id);
    if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
    if (registro.usuario !== user.id) return res.status(403).json({ error: 'Sin permiso' });

    const ahora = ahoraMexico();
    const horaSalida = ahora.hora;

    function calcularHoras(entrada, salida) {
      const ini = aMinutos(entrada);
      const fin = aMinutos(salida);
      if (ini == null || fin == null || fin <= ini) return 0;
      return Math.round(((fin - ini) / 60) * 100) / 100;
    }

    const horas = calcularHoras(registro.hora_entrada, horaSalida);
    const estado = horas < 0.5 ? 'incompleto' : 'cerrado';

    db.prepare(`
      UPDATE registros_qr SET hora_salida = ?, estado_registro = ?, horas = ?, fecha_modificacion = ? WHERE id = ?
    `).run(horaSalida, estado, horas, ahora.iso, registro_id);

    // Verificar límite de 17:15 para participantes
    let incidencia = null;
    const ROLES_PARTICIPANTE = ['voluntario', 'servicio_social'];
    const esParticipante = ROLES_PARTICIPANTE.includes(user.role);
    const minSalida = aMinutos(horaSalida);
    const HORA_LIMITE_MIN = 17 * 60 + 15;
    if (esParticipante && minSalida != null && minSalida > HORA_LIMITE_MIN) {
      const inc = db.prepare(`
        INSERT INTO incidencias (id, tipo_incidencia, usuario_afectado, asignacion, registro, descripcion, prioridad, estado_incidencia, creado_por)
        VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('incumplimiento', user.id, registro.asignacion || null, registro_id,
        `Fichaje rebasó el límite de 17:15 (salida a las ${horaSalida}). Horas registradas: ${horas}h.`,
        'media', 'reportada', user.id);
      incidencia = { id: inc.lastInsertRowid };
    }

    const actualizado = db.prepare('SELECT * FROM registros_qr WHERE id = ?').get(registro_id);
    res.json({ registro: actualizado, horas, estado, incidencia_generada: !!incidencia });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ObtenerPersonalArea
router.post('/ObtenerPersonalArea', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const me = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!me) return res.status(401).json({ error: 'Unauthorized' });

    const area = me.role === 'admin' ? null : (me.area_encargada || null);
    if (me.role !== 'admin' && me.role !== 'encargado') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const all = db.prepare('SELECT * FROM users WHERE archivado = 0 ORDER BY full_name').all();
    const users = area ? all.filter(u => u.area_asignada === area) : all;
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ObtenerPersonalCompleto
router.post('/ObtenerPersonalCompleto', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const me = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!me) return res.status(401).json({ error: 'Unauthorized' });
    if (me.role !== 'admin' && me.role !== 'encargado') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const all = db.prepare('SELECT * FROM users WHERE archivado = 0 ORDER BY full_name').all();
    res.json({ users: all });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IniciarPaseLista
router.post('/IniciarPaseLista', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const me = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    if (!me) return res.status(401).json({ error: 'Unauthorized' });
    if (me.role !== 'admin' && me.role !== 'encargado') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { area, mensaje } = req.body;
    if (!area) return res.status(400).json({ error: 'Área requerida' });
    if (me.role === 'encargado' && me.area_encargada !== area) {
      return res.status(403).json({ error: 'Solo puedes pasar lista en tu área asignada' });
    }

    const nombreCreador = me.nombre_completo || me.full_name || 'Encargado';

    const pase = db.prepare(`
      INSERT INTO pases_lista (id, area, creado_por, creado_por_nombre, estado, mensaje)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
    `).run(area, user.id, nombreCreador, 'activo', mensaje || '');

    const paseLista = db.prepare('SELECT * FROM pases_lista WHERE rowid = ?').get(pase.lastInsertRowid);
    res.json({ ok: true, pase_lista: paseLista, notificados: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AsignarBonoEvidencia
router.post('/AsignarBonoEvidencia', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { evidencia_id } = req.body;
    if (!evidencia_id) return res.status(400).json({ error: 'Falta evidencia_id' });

    const evidencia = db.prepare('SELECT * FROM evidencias WHERE id = ?').get(evidencia_id);
    if (!evidencia) return res.status(404).json({ error: 'Evidencia no encontrada' });

    let actividad = null;
    if (evidencia.actividad) {
      actividad = db.prepare('SELECT * FROM actividades WHERE id = ?').get(evidencia.actividad);
    }

    db.prepare(`
      UPDATE evidencias SET estado_evidencia = ?, aprobado_por = ? WHERE id = ?
    `).run('aprobada', user.id, evidencia_id);

    const horas = actividad?.horas_asignadas || 1;
    const bono = db.prepare(`
      INSERT INTO bonos (id, usuario, asignacion, horas, fecha, motivo)
      VALUES (lower(hex(randomblob(16))), ?, ?, ?, date('now'), ?)
    `).run(evidencia.usuario, evidencia.asignacion || null, horas, `Bono por evidencia aprobada: ${evidencia.titulo || ''}`);

    res.json({ ok: true, bono: { id: bono.lastInsertRowid } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// EnviarInvitacion
router.post('/EnviarInvitacion', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const { email, rol, area, invitacion_id } = req.body;

    if (invitacion_id) {
      db.prepare('UPDATE invitaciones SET estado = ?, fecha_envio = datetime("now") WHERE id = ?')
        .run('pendiente', invitacion_id);
      const inv = db.prepare('SELECT * FROM invitaciones WHERE id = ?').get(invitacion_id);
      return res.json({ ok: true, invitacion: inv });
    }

    const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    db.prepare(`
      INSERT INTO invitaciones (id, email, rol, area, estado)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, email, rol || 'user', area || null, 'pendiente');

    const invitacion = db.prepare('SELECT * FROM invitaciones WHERE id = ?').get(id);
    res.json({ ok: true, invitacion });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// NotificarEvidenciaAprobada
router.post('/NotificarEvidenciaAprobada', authMiddleware, (req, res) => {
  try {
    const { evidencia_id } = req.body;
    const evidencia = db.prepare('SELECT * FROM evidencias WHERE id = ?').get(evidencia_id);
    if (!evidencia) return res.status(404).json({ error: 'Evidencia no encontrada' });

    const alumno = db.prepare('SELECT * FROM users WHERE id = ?').get(evidencia.usuario);
    // En self-hosted, el email es simulado
    res.json({ ok: true, message: 'Notificación simulada (self-hosted)' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ObtenerEventosGoogleCalendar
router.post('/ObtenerEventosGoogleCalendar', authMiddleware, (req, res) => {
  // En self-hosted, Google Calendar no está conectado por defecto
  res.json({ eventos: [], message: 'Google Calendar no configurado en modo self-hosted' });
});

// RevisarIncidenciasSemanales
router.post('/RevisarIncidenciasSemanales', authMiddleware, (req, res) => {
  try {
    const unaSemanaAtras = new Date();
    unaSemanaAtras.setDate(unaSemanaAtras.getDate() - 7);
    const fechaLimite = unaSemanaAtras.toISOString();

    const incs = db.prepare(`
      SELECT * FROM incidencias WHERE estado_incidencia = 'reportada' AND created_date > ?
    `).all(fechaLimite);

    const asigs = db.prepare(`
      SELECT * FROM asignaciones WHERE estado = 'activo'
    `).all();

    for (const a of asigs) {
      const incsUsuario = incs.filter(i => i.usuario_afectado === a.usuario);
      if (incsUsuario.length >= 3) {
        db.prepare('UPDATE asignaciones SET estado = ? WHERE id = ?').run('bajo_revision', a.id);
      }
    }

    res.json({ ok: true, revisadas: incs.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SincronizarPerfilInvitado
router.post('/SincronizarPerfilInvitado', authMiddleware, (req, res) => {
  try {
    const user = req.user;
    const invs = db.prepare('SELECT * FROM invitaciones WHERE email = ?').all(user.email);

    if (invs.length > 0) {
      const inv = invs[0];
      db.prepare('UPDATE invitaciones SET estado = ?, usuario_id = ? WHERE id = ?')
        .run('aceptada', user.id, inv.id);
      db.prepare('UPDATE users SET role = ?, area_asignada = ? WHERE id = ?')
        .run(inv.rol || 'user', inv.area || null, user.id);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
