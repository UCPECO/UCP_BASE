// Lógica de gestión de personal del lado del servidor:
// notificaciones internas, constancia automática al llegar a la meta
// y cierre automático de fichajes olvidados.
import { db } from '../database.js';
import { enviarPush } from './push.js';

function nuevoId() {
  return db.prepare('SELECT lower(hex(randomblob(16))) AS id').get().id;
}

// Fecha/hora actual en Centro de México
function ahoraMexico() {
  const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`,
    hora: `${pad(t.getHours())}:${pad(t.getMinutes())}`,
  };
}

// ===== Notificaciones =====
export function notificar(usuarioId, titulo, mensaje, enlace = null) {
  if (!usuarioId) return;
  try {
    db.prepare(`
      INSERT INTO notificaciones (id, usuario, titulo, mensaje, enlace, leida)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(nuevoId(), usuarioId, titulo, mensaje || '', enlace);
    // Push nativa al dispositivo (llega aunque la app esté cerrada);
    // fire-and-forget: nunca debe frenar ni romper el flujo principal
    enviarPush(usuarioId, { titulo, mensaje, enlace }).catch(() => {});
  } catch (e) {
    console.error('Error creando notificación:', e.message);
  }
}

// Avisa a los encargados de un área; si no hay ninguno, avisa a los admins
export function notificarEncargadosDeArea(area, titulo, mensaje, enlace = '/encargado/registros') {
  try {
    let destinatarios = [];
    if (area) {
      destinatarios = db.prepare(`
        SELECT id FROM users WHERE role = 'encargado' AND area_encargada = ? AND archivado = 0
      `).all(area);
    }
    if (destinatarios.length === 0) {
      destinatarios = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND archivado = 0`).all();
      enlace = '/admin/registros';
    }
    for (const d of destinatarios) notificar(d.id, titulo, mensaje, enlace);
    return destinatarios.length;
  } catch (e) {
    console.error('Error notificando encargados:', e.message);
    return 0;
  }
}

// ===== Horas validadas de un usuario (fichajes validados + bonos + ajustes) =====
// Regla oficial: cada fichaje se redondea al múltiplo de 10 min más cercano;
// los ajustes de horas del admin (residuos acreditados / ajustes manuales) suman.
export function horasValidadasDe(usuarioId) {
  const regs = db.prepare(`
    SELECT hora_entrada, hora_salida FROM registros_qr
    WHERE usuario = ? AND estado_registro IN ('cerrado', 'incompleto') AND validado = 1
  `).all(usuarioId);
  let mins = 0;
  for (const r of regs) {
    if (!r.hora_entrada || !r.hora_salida) continue;
    const [h1, m1] = r.hora_entrada.split(':').map(Number);
    const [h2, m2] = r.hora_salida.split(':').map(Number);
    let d = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (d < 0) d += 24 * 60;
    mins += Math.round(d / 10) * 10; // redondeo a 10 min más cercano
  }
  const bonos = db.prepare('SELECT COALESCE(SUM(horas), 0) AS t FROM bonos WHERE usuario = ?').get(usuarioId);
  let ajustesMin = 0;
  try {
    ajustesMin = db.prepare('SELECT COALESCE(SUM(minutos), 0) AS t FROM ajustes_horas WHERE usuario = ?').get(usuarioId)?.t || 0;
  } catch { /* tabla aún no existe en instalaciones viejas */ }
  return Math.round(((mins / 60) + (bonos?.t || 0) + (ajustesMin / 60)) * 100) / 100;
}

// ===== Constancia automática al llegar a la meta =====
// Se llama cada vez que se valida un fichaje o se asigna un bono.
export function verificarConstanciaAutomatica(usuarioId) {
  try {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(usuarioId);
    if (!u || !['servicio_social', 'voluntario', 'practicas_profesionales'].includes(u.role)) return;

    // Meta: la de la actividad de su asignación activa, o 480 h por defecto
    const asig = db.prepare(`SELECT * FROM asignaciones WHERE usuario = ? AND estado = 'activo' ORDER BY created_date DESC LIMIT 1`).get(usuarioId);
    let meta = 480;
    let fechaInicio = null;
    if (asig) {
      fechaInicio = asig.fecha_inicio || null;
      if (asig.actividad) {
        const act = db.prepare('SELECT meta_horas FROM actividades WHERE id = ?').get(asig.actividad);
        // meta_horas no existe en todas las instalaciones; si falta, 480
        if (act && Number(act.meta_horas) > 0) meta = Number(act.meta_horas);
      }
    }

    const total = horasValidadasDe(usuarioId);
    if (total < meta) return;

    // No duplicar: una sola constancia de término vigente por persona
    const yaTiene = db.prepare(`
      SELECT 1 FROM constancias WHERE usuario = ? AND tipo = 'constancia_termino' AND estado = 'vigente' LIMIT 1
    `).get(usuarioId);
    if (yaTiene) return;

    const { fecha } = ahoraMexico();
    const anio = fecha.slice(0, 4);
    const consecutivo = (db.prepare(`SELECT COUNT(*) AS n FROM constancias WHERE tipo = 'constancia_termino'`).get().n || 0) + 1;
    const folio = `UCP-${anio}-${String(consecutivo).padStart(3, '0')}`;
    const nombre = u.nombre_completo || u.full_name || u.email;

    db.prepare(`
      INSERT INTO constancias (id, usuario, usuario_nombre, matricula, tipo, tipo_constancia, area, horas_completadas, fecha_inicio, fecha_fin, folio, estado, fecha_emision, generado_por_nombre)
      VALUES (?, ?, ?, ?, 'constancia_termino', 'constancia_termino', ?, ?, ?, ?, ?, 'vigente', ?, 'Sistema (automático)')
    `).run(nuevoId(), usuarioId, nombre, u.matricula || '', u.area_asignada || '', total, fechaInicio, fecha, folio, fecha);

    notificar(usuarioId,
      '🎓 ¡Constancia de término generada!',
      `Completaste tu meta de ${meta} h. Tu constancia (folio ${folio}) ya está disponible en "Mis constancias".`,
      '/alumno/constancias');
    console.log(`Constancia automática generada: ${folio} para ${nombre}`);
  } catch (e) {
    console.error('Error en constancia automática:', e.message);
  }
}

// ===== Resumen semanal por push =====
// Cada lunes por la mañana (hora CDMX) se envía a cada participante activo:
// horas de la semana pasada, % de su meta y su racha de días laborales.
// Se registra el envío para no duplicarlo aunque el servidor reinicie.
export function resumenSemanalSiCorresponde() {
  try {
    const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    if (ahora.getDay() !== 1) return 0; // solo lunes
    const hora = ahora.getHours();
    if (hora < 8 || hora > 11) return 0; // ventana de envío: 8–11 am

    db.exec(`CREATE TABLE IF NOT EXISTS envios_programados (clave TEXT PRIMARY KEY, fecha TEXT DEFAULT (datetime('now')))`);
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hoy = iso(ahora);
    const clave = `resumen-${hoy}`;
    if (db.prepare('SELECT 1 FROM envios_programados WHERE clave = ?').get(clave)) return 0;
    db.prepare('INSERT INTO envios_programados (clave) VALUES (?)').run(clave);

    // Semana pasada: lunes a domingo anterior
    const finSemana = new Date(ahora); finSemana.setDate(finSemana.getDate() - 1); // domingo
    const inicioSemana = new Date(ahora); inicioSemana.setDate(inicioSemana.getDate() - 7); // lunes pasado
    const desde = iso(inicioSemana), hasta = iso(finSemana);

    const esLaboral = (d) => d.getDay() !== 0 && d.getDay() !== 6;

    const usuarios = db.prepare(`
      SELECT id, nombre_completo, full_name, email FROM users
      WHERE role IN ('servicio_social', 'voluntario', 'practicas_profesionales', 'residente', 'practicante')
        AND (archivado IS NULL OR archivado = 0)
    `).all();

    let enviados = 0;
    for (const u of usuarios) {
      // Solo quien tiene asignación activa (participa actualmente)
      const asig = db.prepare(`SELECT * FROM asignaciones WHERE usuario = ? AND estado = 'activo' ORDER BY created_date DESC LIMIT 1`).get(u.id);
      if (!asig) continue;

      const horasSemana = db.prepare(`
        SELECT COALESCE(SUM(horas), 0) AS t FROM registros_qr
        WHERE usuario = ? AND fecha BETWEEN ? AND ? AND estado_registro IN ('cerrado', 'incompleto')
      `).get(u.id, desde, hasta)?.t || 0;

      // Meta de su actividad
      let meta = 480;
      if (asig.actividad) {
        const act = db.prepare('SELECT meta_horas FROM actividades WHERE id = ?').get(asig.actividad);
        if (act && Number(act.meta_horas) > 0) meta = Number(act.meta_horas);
      }
      const total = horasValidadasDe(u.id);
      const pct = Math.min(100, Math.round((total / meta) * 100));

      // Racha de días laborales con fichaje (misma regla que el dashboard)
      const fechas = new Set(db.prepare(`
        SELECT DISTINCT fecha FROM registros_qr WHERE usuario = ? ORDER BY fecha DESC LIMIT 400
      `).all(u.id).map((r) => r.fecha));
      let cursor = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
      while (!esLaboral(cursor)) cursor.setDate(cursor.getDate() - 1);
      if (!fechas.has(iso(cursor))) { do { cursor.setDate(cursor.getDate() - 1); } while (!esLaboral(cursor)); }
      let racha = 0;
      while (fechas.has(iso(cursor))) { racha++; do { cursor.setDate(cursor.getDate() - 1); } while (!esLaboral(cursor)); }

      const nombre = (u.nombre_completo || u.full_name || u.email || '').split(' ')[0] || 'Hola';
      const hs = Math.round(horasSemana * 100) / 100;
      const mensaje = hs > 0
        ? `La semana pasada sumaste ${hs} h · llevas ${pct}% de tu meta · racha de ${racha} ${racha === 1 ? 'día' : 'días'}. ¡Sigue así!`
        : `La semana pasada no registraste horas. Llevas ${pct}% de tu meta — ¡esta semana es la buena!`;
      notificar(u.id, `📊 Tu resumen semanal, ${nombre}`, mensaje, '/alumno');
      enviados++;
    }
    console.log(`Resumen semanal: ${enviados} notificaciones enviadas (${desde} a ${hasta})`);
    return enviados;
  } catch (e) {
    console.error('Error en resumen semanal:', e.message);
    return 0;
  }
}

// ===== Cierre automático de fichajes olvidados =====
// Todo fichaje abierto de un día anterior se cierra a la hora de cierre
// configurada, queda pendiente de validación y genera incidencia + aviso.
export function cerrarFichajesOlvidados() {
  try {
    const { fecha: hoy, hora } = ahoraMexico();
    const config = db.prepare('SELECT * FROM configuracion_sistema LIMIT 1').get();
    const horaCierre = config?.hora_cierre || '18:00';

    const abiertos = db.prepare(`
      SELECT * FROM registros_qr WHERE estado_registro = 'abierto' AND fecha < ?
    `).all(hoy);

    for (const r of abiertos) {
      const [h1, m1] = (r.hora_entrada || horaCierre).split(':').map(Number);
      const [h2, m2] = horaCierre.split(':').map(Number);
      let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (mins < 0) mins = 0;
      const horas = Math.round((mins / 60) * 100) / 100;

      db.prepare(`
        UPDATE registros_qr SET hora_salida = ?, estado_registro = 'cerrado', horas = ?, fecha_modificacion = datetime('now') WHERE id = ?
      `).run(horaCierre, horas, r.id);

      db.prepare(`
        INSERT INTO incidencias (id, tipo_incidencia, usuario_afectado, asignacion, registro, descripcion, prioridad, estado_incidencia, creado_por)
        VALUES (?, 'falta', ?, ?, ?, ?, 'media', 'reportada', 'sistema')
      `).run(nuevoId(), r.usuario, r.asignacion || null, r.id,
        `No registró su salida el ${r.fecha}. El sistema cerró el fichaje automáticamente a las ${horaCierre} (${horas} h). Queda pendiente de validación.`);

      notificar(r.usuario,
        'Fichaje cerrado automáticamente',
        `No registraste tu salida el ${r.fecha}; se cerró a las ${horaCierre}. Si hubo un error, avisa a tu encargado.`,
        '/fichar');
    }
    if (abiertos.length > 0) console.log(`Cierre automático: ${abiertos.length} fichaje(s) olvidado(s) cerrados`);
    return abiertos.length;
  } catch (e) {
    console.error('Error en cierre automático de fichajes:', e.message);
    return 0;
  }
}
