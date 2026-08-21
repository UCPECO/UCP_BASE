// Chat interno "Comunidad": canal general, canal por área y mensajes
// directos (DM) entre dos usuarios. Todo pasa por aquí (no por la ruta
// genérica de entidades) para controlar quién puede leer cada canal.
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';
import { enviarPush } from '../lib/push.js';

const router = Router();

// Escribir mensajes está limitado para frenar spam
const msgLimiter = rateLimit({ windowMs: 60 * 1000, max: 40, mensaje: 'Demasiados mensajes. Espera un momento.' });

function getMe(req) {
  return db.prepare('SELECT id, role, nombre_completo, full_name, email, area_asignada, area_encargada FROM users WHERE id = ?').get(req.user.id) || null;
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

// Directorio de usuarios activos (datos mínimos para chat y toques)
router.get('/directorio', authMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT id, nombre_completo, full_name, role, area_asignada, area_encargada, foto_perfil
    FROM users WHERE COALESCE(archivado, 0) = 0 ORDER BY nombre_completo COLLATE NOCASE
  `).all().map((u) => ({
    id: u.id,
    nombre: nombreDe(u),
    role: u.role,
    area: u.area_encargada || u.area_asignada || null,
    foto: u.foto_perfil || null,
  }));
  res.json(users);
});

// Mis canales: general, el de mi área y mis conversaciones directas
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

// Leer mensajes de un canal (los últimos 60, o solo los nuevos con ?desde=)
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
  res.json(rows);
});

// Enviar mensaje
router.post('/canal/:canal/mensajes', authMiddleware, msgLimiter, (req, res) => {
  const me = getMe(req);
  if (!me) return res.status(401).json({ error: 'No autorizado' });
  const canal = req.params.canal;
  if (!puedeAcceder(me, canal)) return res.status(403).json({ error: 'No tienes acceso a este canal' });

  const texto = String(req.body?.texto || '').trim().slice(0, 1000);
  if (!texto) return res.status(400).json({ error: 'El mensaje está vacío' });

  const id = uuidv4();
  db.prepare(`INSERT INTO mensajes (id, canal, usuario, usuario_nombre, texto) VALUES (?, ?, ?, ?, ?)`)
    .run(id, canal, me.id, nombreDe(me), texto);
  const row = db.prepare('SELECT * FROM mensajes WHERE id = ?').get(id);

  // En DM, push a la otra persona (llega aunque tenga la app cerrada)
  if (canal.startsWith('dm:')) {
    const [, a, b] = canal.split(':');
    const otroId = a === me.id ? b : a;
    enviarPush(otroId, { titulo: `💬 ${nombreDe(me)}`, mensaje: texto.slice(0, 140), enlace: '/comunidad' }).catch(() => {});
  }

  res.status(201).json(row);
});

// Iniciar (o ubicar) un DM con otro usuario: devuelve el canal
router.post('/dm', authMiddleware, (req, res) => {
  const me = getMe(req);
  const otro = String(req.body?.usuario || '');
  if (!otro || otro === me.id) return res.status(400).json({ error: 'Usuario destino inválido' });
  const existe = db.prepare('SELECT id FROM users WHERE id = ? AND COALESCE(archivado, 0) = 0').get(otro);
  if (!existe) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ canal: canalDm(me.id, otro) });
});

export default router;
