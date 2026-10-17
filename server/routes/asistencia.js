// Asistencia real: qué días concurre cada persona.
//
// Se agrega EN EL SERVIDOR a propósito. Las pantallas que sumaban en el
// navegador sobre un `LIMIT 100`/`500` daban totales incompletos en cuanto la
// tabla crecía (causa raíz E de la revisión): el progreso de un alumno dejaba
// de subir cerca de la meta. Aquí SQLite hace el GROUP BY y el cliente solo
// pinta, así el resultado no depende de cuántas filas quepan en una página.
//
// Además aplica scoping por área para el rol encargado: un encargado solo ve a
// la gente de su área, no a toda la organización (BUG-11).
import { Router } from 'express';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Fecha y hora actuales en hora de México (UTC-6), no en la del servidor:
// el despliegue puede correr en UTC y desplazaría todo un día.
function ahoraMexico() {
  const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
    anio: t.getFullYear(),
    mes: t.getMonth() + 1,
  };
}

function diasDelMes(anio, mes) {
  return new Date(anio, mes, 0).getDate();
}

// Rango YYYY-MM-DD a partir de un periodo "YYYY-MM" o de desde/hasta explícitos
function resolverRango({ periodo, desde, hasta }) {
  const hoy = ahoraMexico();
  if (desde && hasta) return { desde: String(desde).slice(0, 10), hasta: String(hasta).slice(0, 10) };
  const per = /^\d{4}-\d{2}$/.test(String(periodo || '')) ? String(periodo) : `${hoy.anio}-${String(hoy.mes).padStart(2, '0')}`;
  const [a, m] = per.split('-').map(Number);
  const n = diasDelMes(a, m);
  return { desde: `${per}-01`, hasta: `${per}-${String(n).padStart(2, '0')}`, periodo: per };
}

// Días hábiles del rango según la configuración (para comparar contra lo real)
function diasHabiles(desde, hasta, diasLaborales) {
  const permitidos = new Set(
    String(diasLaborales || '')
      .split(',')
      .map((d) => d.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
      .filter(Boolean)
  );
  const sinAcento = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const out = [];
  const d = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime())) return out;
  const pad = (n) => String(n).padStart(2, '0');
  while (d <= fin) {
    const nombre = DIAS[d.getDay()];
    // Sin configuración de días laborales se cuentan todos los del rango
    if (permitidos.size === 0 || permitidos.has(sinAcento(nombre))) {
      out.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function me(req) {
  // Rol fresco desde la BD: el JWT puede estar desactualizado hasta 7 días
  return db.prepare('SELECT id, role, area_encargada, archivado FROM users WHERE id = ?').get(req.user.id) || null;
}

// ===== Asistencia por persona =====
// POST /api/asistencia/por-persona  { periodo } o { desde, hasta }
router.post('/por-persona', authMiddleware, (req, res) => {
  try {
    const actor = me(req);
    if (!actor || Number(actor.archivado) === 1) return res.status(401).json({ error: 'No autorizado' });
    const esAdmin = actor.role === 'admin';
    const esEncargado = actor.role === 'encargado';
    if (!esAdmin && !esEncargado) {
      return res.status(403).json({ error: 'Solo admin o encargado pueden ver la asistencia del personal' });
    }

    const { desde, hasta, periodo } = resolverRango(req.body || {});
    const config = db.prepare('SELECT * FROM configuracion_sistema LIMIT 1').get();
    const habiles = diasHabiles(desde, hasta, config?.dias_laborales);

    // Encargado: solo su área. Admin: todo.
    const soloArea = esEncargado ? actor.area_encargada : (req.body?.area || null);

    const where = ['r.fecha BETWEEN ? AND ?'];
    const params = [desde, hasta];
    // Solo fichajes cerrados o incompletos: los abiertos aún no son una asistencia
    // completa y contarlos inflaría los días.
    where.push(`r.estado_registro IN ('cerrado', 'incompleto')`);

    const filas = db.prepare(
      `SELECT r.usuario, r.fecha,
              MIN(r.hora_entrada) AS primera_entrada,
              MAX(COALESCE(r.hora_salida, r.hora_entrada)) AS ultima_salida,
              COALESCE(SUM(r.horas), 0) AS horas,
              MAX(COALESCE(r.validado, 0)) AS validado,
              MAX(COALESCE(r.es_manual, 0)) AS es_manual
       FROM registros_qr r
       WHERE ${where.join(' AND ')}
       GROUP BY r.usuario, r.fecha`
    ).all(...params);

    // Datos de las personas, con el filtro de área resuelto en SQL
    const usuarios = db.prepare(
      `SELECT id, nombre_completo, full_name, email, role, area_asignada, area_encargada, archivado, matricula
       FROM users WHERE COALESCE(archivado, 0) = 0`
    ).all();

    const porId = new Map();
    for (const u of usuarios) {
      if (soloArea) {
        const area = u.area_asignada || u.area_encargada || '';
        if (area !== soloArea) continue;
      }
      // El personal que fichó aunque ya no esté en la lista activa también cuenta
      porId.set(u.id, u);
    }
    // Incluir a quien tiene fichajes pero ya no aparece como activo (baja):
    // su asistencia histórica no debe desaparecer del reporte.
    for (const f of filas) {
      if (!porId.has(f.usuario)) {
        const u = db.prepare('SELECT id, nombre_completo, full_name, email, role, area_asignada, area_encargada, archivado FROM users WHERE id = ?').get(f.usuario);
        if (!u) continue;
        // El filtro de área aplica TAMBIÉN a las bajas. Sin esta línea el bucle
        // deshacía el scoping y un encargado volvía a ver a toda la organización
        // en cuanto alguien con fichajes estaba dado de baja (el BUG-11 de la
        // revisión, reintroducido en código nuevo).
        if (soloArea && (u.area_asignada || u.area_encargada || '') !== soloArea) continue;
        porId.set(u.id, u);
      }
    }

    const personas = [];
    for (const [id, u] of porId) {
      const susDias = filas.filter((f) => f.usuario === id);

      const porDiaSemana = {};
      for (const d of DIAS) porDiaSemana[d] = 0;
      let horas = 0;
      let manuales = 0;
      for (const f of susDias) {
        const dt = new Date(`${f.fecha}T00:00:00`);
        if (!Number.isNaN(dt.getTime())) porDiaSemana[DIAS[dt.getDay()]] += 1;
        horas += Number(f.horas) || 0;
        if (Number(f.es_manual)) manuales += 1;
      }

      personas.push({
        usuario: id,
        nombre: u.nombre_completo || u.full_name || u.email || 'Sin nombre',
        matricula: u.matricula || null,
        role: u.role,
        // Marcado para que la UI pueda avisar: trabajó esos días pero ya causó
        // baja. Se incluye a propósito para que por-persona y por-dia cuadren.
        archivado: Number(u.archivado) === 1,
        area: u.area_encargada || u.area_asignada || null,
        dias: susDias.map((f) => f.fecha).sort(),
        detalle: susDias
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((f) => ({
            fecha: f.fecha,
            entrada: f.primera_entrada,
            salida: f.ultima_salida,
            horas: Math.round((Number(f.horas) || 0) * 100) / 100,
            validado: !!Number(f.validado),
            manual: !!Number(f.es_manual),
          })),
        total_dias: susDias.length,
        horas: Math.round(horas * 100) / 100,
        fichajes_manuales: manuales,
        por_dia_semana: porDiaSemana,
        // Día de la semana en que más asiste: responde directamente a
        // "qué días concurre" sin tener que leer la tabla entera.
        dia_habitual: Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0]?.[1] > 0
          ? Object.entries(porDiaSemana).sort((a, b) => b[1] - a[1])[0][0]
          : null,
        cumplimiento: habiles.length ? Math.round((susDias.length / habiles.length) * 100) : null,
      });
    }

    // Ordenar por días asistidos (quien más concurre arriba)
    personas.sort((a, b) => b.total_dias - a.total_dias || a.nombre.localeCompare(b.nombre, 'es'));

    const totalAsistencias = personas.reduce((a, p) => a + p.total_dias, 0);
    res.json({
      desde,
      hasta,
      periodo: periodo || `${desde.slice(0, 7)}`,
      dias_habiles: habiles,
      total_dias_habiles: habiles.length,
      area_filtrada: soloArea || null,
      personas,
      resumen: {
        total_personas: personas.length,
        con_asistencia: personas.filter((p) => p.total_dias > 0).length,
        sin_asistencia: personas.filter((p) => p.total_dias === 0).length,
        total_asistencias: totalAsistencias,
        promedio_dias: personas.length ? Math.round((totalAsistencias / personas.length) * 10) / 10 : 0,
        total_horas: Math.round(personas.reduce((a, p) => a + p.horas, 0) * 100) / 100,
      },
      // Distribución por día de la semana de toda el área: para ver de un vistazo
      // qué días concurre más gente.
      por_dia_semana: DIAS.reduce((acc, d) => {
        acc[d] = personas.reduce((a, p) => a + (p.por_dia_semana[d] || 0), 0);
        return acc;
      }, {}),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Calendario de ocupación por día =====
// POST /api/asistencia/por-dia  { periodo }
// Cuánta gente concurre cada día: sirve para decidir turnos y ver picos.
router.post('/por-dia', authMiddleware, (req, res) => {
  try {
    const actor = me(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'encargado')) {
      return res.status(403).json({ error: 'Solo admin o encargado' });
    }
    const { desde, hasta, periodo } = resolverRango(req.body || {});
    const soloArea = actor.role === 'encargado' ? actor.area_encargada : (req.body?.area || null);

    const params = [desde, hasta];
    let filtroArea = '';
    if (soloArea) {
      filtroArea = `AND (u.area_asignada = ? OR u.area_encargada = ?)`;
      params.push(soloArea, soloArea);
    }

    const filas = db.prepare(
      `SELECT r.fecha, COUNT(DISTINCT r.usuario) AS personas, COUNT(*) AS fichajes,
              COALESCE(SUM(r.horas), 0) AS horas
       FROM registros_qr r
       JOIN users u ON u.id = r.usuario
       WHERE r.fecha BETWEEN ? AND ?
         AND r.estado_registro IN ('cerrado', 'incompleto')
         ${filtroArea}
       GROUP BY r.fecha
       ORDER BY r.fecha ASC`
    ).all(...params);

    res.json({
      desde,
      hasta,
      periodo: periodo || `${desde.slice(0, 7)}`,
      dias: filas.map((f) => ({
        fecha: f.fecha,
        dia_semana: (() => { const d = new Date(`${f.fecha}T00:00:00`); return Number.isNaN(d.getTime()) ? null : DIAS[d.getDay()]; })(),
        personas: f.personas,
        fichajes: f.fichajes,
        horas: Math.round((Number(f.horas) || 0) * 100) / 100,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
