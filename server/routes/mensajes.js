// Chat interno "Comunidad": canal general, canal por área y mensajes
// directos (DM) entre dos usuarios. Todo pasa por aquí (no por la ruta
// genérica de entidades) para controlar quién puede leer cada canal.
// v2: avisos fijados con confirmación de lectura, reacciones rápidas,
// respuestas con cita, menciones @ con notificación, estado en línea
// y moderación (borrar mensajes, silenciar usuarios).
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit, registrarEnBitacora } from '../middleware/security.js';
import { enviarPush } from '../lib/push.js';
import { notificar } from '../lib/gestion.js';

const router = Router();

// Escribir mensajes está limitado para frenar spam
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, mensaje: 'Demasiados mensajes. Espera un momento.' });

const EMOJIS_OK = ['👍', '❤️', '✅', '🎉', '😮'];

function getMe(req) {
  return db.prepare('SELECT id, role, nombre_completo, full_name, email, area_asignada, area_encargada, silenciado FROM users WHERE id = ?').get(req.user.id) || null;
}

const nombreDe = (u) => u?.nombre_completo || u?.full_name || u?.email || 'Usuario';

// ¿Puede este usuario participar en el canal?
function puedeAcceder(me, canal) {
  if (!me) return false;
  if (canal === 'general') return true;
  if (canal.startsWith('area:')) {
    const area = canal.slice(5);
    return me.role === 'admin' || me.area_asignada === area || me.area_encargada === area;
  }
  if (canal.startsWith('dm:')) {
    const [, a, b] = canal.split(':');
    return me.id === a || me.id === b;
  }
  return false;
}

// Id estable del canal DM entre dos personas (orden alfabético)
function canalDm(a, b) {
  return 'dm:' + [a, b].sort().join(':');
}

// Ids de los miembros de un canal (para conteos "visto por X de Y" y avisos).
// En canales de área el admin puede leer pero no cuenta como miembro.
function miembrosDelCanal(canal) {
  if (canal === 'general') {
    return db.prepare(`SELECT id FROM users WHERE COALESCE(archivado, 0) = 0`).all().map((r) => r.id);
  }
  if (canal.startsWith('area:')) {
    const area = canal.slice(5);
    return db.prepare(`SELECT id FROM users WHERE COALESCE(archivado, 0) = 0 AND (area_asignada = ? OR area_encargada = ?)`).all(area, area).map((r) => r.id);
  }
  if (canal.startsWith('dm:')) {
    const [, a, b] = canal.split(':');
    return [a, b];
  }
  return [];
}

// Agrega a cada mensaje sus reacciones agrupadas y, si está fijado,
// el conteo de confirmaciones de lectura.
function adjuntarExtras(rows, meId) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');

  const rx = db.prepare(`SELECT mensaje, emoji, usuario FROM reacciones WHERE mensaje IN (${ph})`).all(...ids);
  const porMsg = {};
  for (const r of rx) {
    if (!porMsg[r.mensaje]) porMsg[r.mensaje] = {};
    const g = porMsg[r.mensaje][r.emoji] = porMsg[r.mensaje][r.emoji] || { n: 0, mia: false };
    g.n++;
    if (r.usuario === meId) g.mia = true;
  }

  let vistos = {};
  if (rows.some((m) => m.fijado)) {
    const vistosRows = db.prepare(`
      SELECT mensaje, COUNT(*) AS n, MAX(CASE WHEN usuario = ? THEN 1 ELSE 0 END) AS yo
      FROM avisos_vistos WHERE mensaje IN (${ph}) GROUP BY mensaje
    `).all(meId, ...ids);
    for (const v of vistosRows) vistos[v.mensaje] = { n: v.n, mio: !!v.yo };
  }

  return rows.map((m) => ({
    ...m,
    reacciones: porMsg[m.id] || {},
    ...(m.fijado ? { vistos: vistos[m.id]?.n || 0, visto_por_mi: !!vistos[m.id]?.mio } : {}),
  }));
}

// Detecta @menciones por nombre completo o primer nombre (mín. 3 letras).
// Devuelve ids de usuarios activos mencionados (máx. 5, sin el autor).
function detectarMenciones(texto, autorId) {
  const lower = texto.toLowerCase();
  if (!lower.includes('@')) return [];
  const usuarios = db.prepare(`
    SELECT id, nombre_completo, full_name, email FROM users
    WHERE COALESCE(archivado, 0) = 0 AND id != ?
  `).all(autorId);
  const encontrados = [];
  for (const u of usuarios) {
    const nombre = nombreDe(u);
    const completo = nombre.toLowerCase();
    const primero = completo.split(/\s+/)[0] || '';
    const porCompleto = completo.length >= 3 && lower.includes('@' + completo);
    const porPrimero = primero.length >= 3 && lower.includes('@' + primero);
    if (porCompleto || porPrimero) {
      encontrados.push(u.id);
      if (encontrados.length >= 5) break;
    }
  }
  return encontrados;
}

// ===== Directorio =====
// Usuarios activos (datos mínimos para chat, toques, menciones y presencia)
router.get('/directorio', authMiddleware, (req, res) => {
  const esAdmin = req.user.role === 'admin';
  const users = db.prepare(`
    SELECT id, nombre_completo, full_name, role, area_asignada, area_encargada, foto_perfil,
           silenciado,
           CASE WHEN ultima_actividad >= datetime('now', '-5 minutes') THEN 1 ELSE 0 END AS en_linea
    FROM users WHERE COALESCE(archivado, 0) = 0 ORDER BY nombre_completo COLLATE NOCASE
  `).all().map((u) => ({
    id: u.id,
    nombre: nombreDe(u),
    role: u.role,
    area: u.area_encargada || u.area_asignada || null,
    foto: u.foto_perfil || null,
    en_linea: !!u.en_linea,
    ...(esAdmin ? { silenciado: !!u.silenciado } : {}),
  }));
  res.json(users);
});

// ===== Mis canales =====
router.get('/canales', authMiddleware, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });

  const canales = [{ canal: 'general', tipo: 'general', nombre: 'Comunidad UCP', descripcion: 'Todos los miembros' }];

  const miArea = me.area_encargada || me.area_asignada;
  if (miArea) {
    canales.push({ canal: `area:${miArea}`, tipo: 'area', nombre: `Área ${miArea}`, descripcion: 'Equipo de tu área' });
  }
  if (me.role === 'admin') {
    // El admin ve los canales de todas las áreas
    const areas = db.prepare(`SELECT DISTINCT area_asignada AS a FROM users WHERE area_asignada IS NOT NULL AND area_asignada != '' UNION SELECT DISTINCT area_encargada FROM users WHERE area_encargada IS NOT NULL AND area_encargada != ''`).all();
    for (const { a } of areas) {
      if (a && a !== miArea) canales.push({ canal: `area:${a}`, tipo: 'area', nombre: `Área ${a}`, descripcion: 'Canal del área' });
    }
  }

  // DMs existentes con último mensaje y la otra persona
  const dms = db.prepare(`
    SELECT m.canal, m.texto, m.created_date, m.usuario, m.usuario_nombre
    FROM mensajes m
    WHERE m.canal LIKE 'dm:%' AND (m.canal LIKE ? OR m.canal LIKE ?)
    GROUP BY m.canal
    HAVING m.created_date = MAX(m.created_date)
    ORDER BY m.created_date DESC
  `).all(`dm:${me.id}:%`, `dm:%:${me.id}`);

  for (const d of dms) {
    const [, a, b] = d.canal.split(':');
    const otroId = a === me.id ? b : a;
    const otro = db.prepare('SELECT id, nombre_completo, full_name, email, foto_perfil FROM users WHERE id = ?').get(otroId);
    if (!otro) continue;
    canales.push({
      canal: d.canal, tipo: 'dm',
      nombre: nombreDe(otro), foto: otro.foto_perfil || null,
      ultimo: d.texto?.slice(0, 60), ultimo_fecha: d.created_date,
      ultimo_propio: d.usuario === me.id,
    });
  }

  res.json(canales);
});

// ===== Leer mensajes =====
// Devuelve { mensajes, fijados, total_miembros }. Con ?desde= solo llegan
// los mensajes nuevos (polling incremental), fijados siempre se incluye.
router.get('/canal/:canal/mensajes', authMiddleware, (req, res) => {
  const me = getMe(req);
  const canal = req.params.canal;
  if (!puedeAcceder(me, canal)) return res.status(403).json({ error: 'No tienes acceso a este canal' });

  const { desde } = req.query;
  let rows;
  if (desde) {
    rows = db.prepare(`SELECT * FROM mensajes WHERE canal = ? AND created_date > ? ORDER BY created_date ASC LIMIT 200`).all(canal, desde);
  } else {
    rows = db.prepare(`SELECT * FROM (SELECT * FROM mensajes WHERE canal = ? ORDER BY created_date DESC LIMIT 60) ORDER BY created_date ASC`).all(canal);
  }

  // Avisos fijados del canal (el banner muestra el más reciente)
  const fij = db.prepare(`SELECT * FROM mensajes WHERE canal = ? AND fijado = 1 ORDER BY created_date DESC LIMIT 3`).all(canal);

  res.json({
    mensajes: adjuntarExtras(rows, me.id),
    fijados: adjuntarExtras(fij, me.id),
    total_miembros: miembrosDelCanal(canal).length,
  });
});

// ===== Enviar mensaje =====
router.post('/canal/:canal/mensajes', authMiddleware, msgLimiter, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });
  if (me.silenciado === 1) {
    return res.status(403).json({ error: 'Un administrador te silenció. No puedes enviar mensajes por ahora.' });
  }
  const canal = req.params.canal;
  if (!puedeAcceder(me, canal)) return res.status(403).json({ error: 'No tienes acceso a este canal' });

  const texto = String(req.body?.texto || '').trim().slice(0, 1000);
  if (!texto) return res.status(400).json({ error: 'El mensaje está vacío' });

  // Respuesta con cita: solo si el mensaje citado es del mismo canal
  let cita_id = null, cita_texto = null, cita_nombre = null;
  const citaReq = String(req.body?.cita_id || '');
  if (citaReq) {
    const orig = db.prepare('SELECT id, canal, texto, usuario_nombre FROM mensajes WHERE id = ?').get(citaReq);
    if (orig && orig.canal === canal) {
      cita_id = orig.id;
      cita_texto = (orig.texto || '').slice(0, 140);
      cita_nombre = orig.usuario_nombre || 'Usuario';
    }
  }

  const id = uuidv4();
  db.prepare(`INSERT INTO mensajes (id, canal, usuario, usuario_nombre, texto, cita_id, cita_texto, cita_nombre) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, canal, me.id, nombreDe(me), texto, cita_id, cita_texto, cita_nombre);
  const row = db.prepare('SELECT * FROM mensajes WHERE id = ?').get(id);

  // En DM, push a la otra persona (llega aunque tenga la app cerrada)
  if (canal.startsWith('dm:')) {
    const [, a, b] = canal.split(':');
    const otroId = a === me.id ? b : a;
    enviarPush(otroId, { titulo: `💬 ${nombreDe(me)}`, mensaje: texto.slice(0, 140), enlace: '/comunidad' }).catch(() => {});
  } else {
    // Menciones @nombre en canales: notificación interna + push
    for (const uid of detectarMenciones(texto, me.id)) {
      notificar(uid, `💬 ${nombreDe(me)} te mencionó`, texto.slice(0, 140), '/comunidad');
    }
  }

  res.status(201).json({ ...row, reacciones: {} });
});

// ===== Iniciar (o ubicar) un DM =====
router.post('/dm', authMiddleware, (req, res) => {
  const me = getMe(req);
  const otro = String(req.body?.usuario || '');
  if (!otro || otro === me.id) return res.status(400).json({ error: 'Usuario destino inválido' });
  const existe = db.prepare('SELECT id FROM users WHERE id = ? AND COALESCE(archivado, 0) = 0').get(otro);
  if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ canal: canalDm(me.id, otro) });
});

// ===== Reacciones rápidas (toggle) =====
router.post('/mensaje/:id/reaccion', authMiddleware, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });
  const msg = db.prepare('SELECT * FROM mensajes WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
  if (!puedeAcceder(me, msg.canal)) return res.status(403).json({ error: 'Sin acceso a este canal' });
  const emoji = String(req.body?.emoji || '');
  if (!EMOJIS_OK.includes(emoji)) return res.status(400).json({ error: 'Reacción no permitida' });

  const ya = db.prepare('SELECT id FROM reacciones WHERE mensaje = ? AND usuario = ? AND emoji = ?').get(msg.id, me.id, emoji);
  if (ya) {
    db.prepare('DELETE FROM reacciones WHERE id = ?').run(ya.id);
    return res.json({ ok: true, activa: false });
  }
  db.prepare('INSERT INTO reacciones (id, mensaje, usuario, emoji) VALUES (?, ?, ?, ?)').run(uuidv4(), msg.id, me.id, emoji);
  res.json({ ok: true, activa: true });
});

// ===== Fijar / desfijar aviso =====
// general: solo admin. area:X: admin o el encargado de X. DM: nadie.
router.post('/mensaje/:id/fijar', authMiddleware, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });
  const msg = db.prepare('SELECT * FROM mensajes WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });

  const canal = msg.canal;
  let permitido = false;
  if (canal === 'general') permitido = me.role === 'admin';
  else if (canal.startsWith('area:')) {
    const area = canal.slice(5);
    permitido = me.role === 'admin' || (me.role === 'encargado' && me.area_encargada === area);
  }
  if (!permitido) return res.status(403).json({ error: 'No puedes fijar avisos en este canal' });

  const fijado = req.body?.fijado !== false ? 1 : 0;
  db.prepare('UPDATE mensajes SET fijado = ? WHERE id = ?').run(fijado, msg.id);
  registrarEnBitacora(me.id, fijado ? 'Fijar aviso' : 'Desfijar aviso', 'Comunidad', `Canal ${canal}: "${(msg.texto || '').slice(0, 80)}"`);

  // Al fijar, avisar a los miembros del canal (campana + push)
  if (fijado) {
    const aviso = `📌 Aviso fijado por ${nombreDe(me)}`;
    for (const uid of miembrosDelCanal(canal)) {
      if (uid !== me.id) notificar(uid, aviso, (msg.texto || '').slice(0, 120), '/comunidad');
    }
  }

  res.json({ ok: true, fijado: !!fijado });
});

// ===== Confirmar lectura de un aviso fijado =====
router.post('/mensaje/:id/visto', authMiddleware, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });
  const msg = db.prepare('SELECT * FROM mensajes WHERE id = ? AND fijado = 1').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Aviso no encontrado' });
  if (!puedeAcceder(me, msg.canal)) return res.status(403).json({ error: 'Sin acceso a este canal' });
  db.prepare('INSERT OR IGNORE INTO avisos_vistos (id, mensaje, usuario) VALUES (?, ?, ?)').run(uuidv4(), msg.id, me.id);
  res.json({ ok: true });
});

// ===== Borrar mensaje (moderación) =====
// Admin siempre; el autor solo dentro de los primeros 10 minutos.
router.delete('/mensaje/:id', authMiddleware, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });
  const msg = db.prepare('SELECT * FROM mensajes WHERE id = ?').get(req.params.id);
  if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });

  const esAdmin = me.role === 'admin';
  const esAutorReciente = msg.usuario === me.id && msg.created_date >= db.prepare(`SELECT datetime('now', '-10 minutes') AS t`).get().t;
  if (!esAdmin && !esAutorReciente) {
    return res.status(403).json({ error: 'Solo el admin o el autor (en los primeros 10 min) pueden borrar' });
  }

  db.prepare('DELETE FROM mensajes WHERE id = ?').run(msg.id);
  db.prepare('DELETE FROM reacciones WHERE mensaje = ?').run(msg.id);
  db.prepare('DELETE FROM avisos_vistos WHERE mensaje = ?').run(msg.id);
  if (esAdmin && msg.usuario !== me.id) {
    registrarEnBitacora(me.id, 'Borrar mensaje', 'Comunidad', `De ${msg.usuario_nombre || msg.usuario}: "${(msg.texto || '').slice(0, 80)}"`);
  }
  res.json({ ok: true });
});

// ===== Silenciar / reactivar usuario (solo admin) =====
router.post('/moderar/silenciar', authMiddleware, (req, res) => {
  const me = getMe(req);
  if (!me || me.role !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede silenciar' });
  const usuario = String(req.body?.usuario || '');
  const silenciado = req.body?.silenciado ? 1 : 0;
  const destino = db.prepare('SELECT id, nombre_completo, full_name, role FROM users WHERE id = ?').get(usuario);
  if (!destino) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (destino.role === 'admin') return res.status(400).json({ error: 'No puedes silenciar a un administrador' });

  db.prepare('UPDATE users SET silenciado = ? WHERE id = ?').run(silenciado, usuario);
  registrarEnBitacora(me.id, silenciado ? 'Silenciar usuario' : 'Reactivar usuario', 'Comunidad', nombreDe(destino));
  res.json({ ok: true, silenciado: !!silenciado });
});

export default router;
