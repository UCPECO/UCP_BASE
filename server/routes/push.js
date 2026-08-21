// Rutas de notificaciones push nativas (Web Push) y "poke" entre usuarios
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit, registrarEnBitacora } from '../middleware/security.js';
import { obtenerClavePublica } from '../lib/push.js';
import { notificar } from '../lib/gestion.js';

const router = Router();

// El poke está limitado para evitar spam entre usuarios
const pokeLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, mensaje: 'Demasiados toques. Espera un momento.' });

// Llave pública VAPID (la necesita el navegador para suscribirse)
router.get('/clave-publica', authMiddleware, (req, res) => {
  const clave = obtenerClavePublica();
  if (!clave) return res.status(503).json({ error: 'Push no disponible en el servidor' });
  res.json({ clave });
});

// Registrar el dispositivo actual del usuario autenticado
router.post('/suscribir', authMiddleware, (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Suscripción inválida' });
  }
  try {
    db.prepare(`
      INSERT INTO push_subscriptions (id, usuario, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET usuario = excluded.usuario, p256dh = excluded.p256dh, auth = excluded.auth
    `).run(uuidv4(), req.user.id, endpoint, keys.p256dh, keys.auth);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Quitar el dispositivo actual (al cerrar sesión o desactivar avisos)
router.post('/desuscribir', authMiddleware, (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) {
    try { db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND usuario = ?').run(endpoint, req.user.id); } catch {}
  }
  res.json({ ok: true });
});

// Poke: un toque rápido ("👋") a cualquier usuario activo.
// Crea la notificación interna y dispara la push (vía hook de notificar).
router.post('/poke', authMiddleware, pokeLimiter, (req, res) => {
  const { usuario } = req.body || {};
  if (!usuario) return res.status(400).json({ error: 'Falta el usuario destino' });
  if (usuario === req.user.id) return res.status(400).json({ error: 'No puedes derte un toque a ti mismo' });

  const destino = db.prepare('SELECT id, nombre_completo, full_name, archivado FROM users WHERE id = ?').get(usuario);
  if (!destino) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (Number(destino.archivado) === 1) return res.status(400).json({ error: 'Ese usuario está dado de baja' });

  const remitente = db.prepare('SELECT nombre_completo, full_name, email FROM users WHERE id = ?').get(req.user.id);
  const nombreRemitente = remitente?.nombre_completo || remitente?.full_name || remitente?.email || 'Alguien';

  notificar(usuario, '👋 Te dieron un toque', `${nombreRemitente} te envió un toque. ¡No olvides fichar y subir tus evidencias!`, '/alumno');
  registrarEnBitacora(req.user.id, 'Poke', 'Notificaciones', `Toque enviado a ${destino.nombre_completo || destino.full_name || usuario}`);
  res.json({ ok: true });
});

export default router;
