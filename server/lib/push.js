// Notificaciones Web Push (VAPID): llegan al dispositivo aunque la app
// esté cerrada. Las llaves se generan una sola vez y se guardan en la BD
// (que vive fuera de la carpeta de la app en producción, así sobreviven
// a los deploys y no hace falta configurar nada en el panel).
import webpush from 'web-push';
import { db } from '../database.js';

let clavePublicaVapid = null;

function obtenerOGenerarLlaves() {
  const get = (k) => db.prepare('SELECT valor FROM claves_sistema WHERE clave = ?').get(k)?.valor;
  let pub = get('vapid_public');
  let priv = get('vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    const up = db.prepare('INSERT INTO claves_sistema (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor');
    up.run('vapid_public', keys.publicKey);
    up.run('vapid_private', keys.privateKey);
    pub = keys.publicKey;
    priv = keys.privateKey;
    console.log('🔑 Llaves VAPID generadas para notificaciones push');
  }
  return { pub, priv };
}

export function inicializarPush() {
  try {
    const { pub, priv } = obtenerOGenerarLlaves();
    webpush.setVapidDetails('mailto:contacto@ucpeco.com.mx', pub, priv);
    clavePublicaVapid = pub;
  } catch (e) {
    console.error('Push desactivado (error inicializando VAPID):', e.message);
  }
}

export function obtenerClavePublica() {
  return clavePublicaVapid;
}

// Envía una notificación push a todos los dispositivos registrados del usuario.
// Las suscripciones muertas (404/410) se limpian solas.
export async function enviarPush(usuarioId, { titulo, mensaje, enlace }) {
  if (!clavePublicaVapid || !usuarioId) return;
  let subs = [];
  try {
    subs = db.prepare('SELECT * FROM push_subscriptions WHERE usuario = ?').all(usuarioId);
  } catch { return; }
  const payload = JSON.stringify({ titulo: titulo || 'UCP Horas', mensaje: mensaje || '', enlace: enlace || '/' });
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        try { db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id); } catch {}
      }
    }
  }
}
