// Lógica de gestión de personal del lado del servidor:
// notificaciones internas, constancia automática al llegar a la meta
// y cierre automático de fichajes olvidados.
import { db } from '../database.js';

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
  } catch (e) {
    console.error('Error creando notificación:', e.message);
  }
}

// ===== Horas validadas de un usuario (fichajes validados + bonos) =====
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
    mins += d;
  }
  const bonos = db.prepare('SELECT COALESCE(SUM(horas), 0) AS t FROM bonos WHERE usuario = ?').get(usuarioId);
  return Math.round(((mins / 60) + (bonos?.t || 0)) * 100) / 100;
}

// ===== Constancia automática al llegar a la meta =====
// Se llama cada vez que se valida un fichaje o se asigna un bono.
export function verificarConstanciaAutomatica(usuarioId) {
  try {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(usuarioId);
    if (!u || (u.role !== 'servicio_social' && u.role !== 'voluntario')) return;

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
