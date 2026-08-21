// Suscripción a notificaciones push nativas (Web Push).
// El navegador registra el dispositivo con la llave pública VAPID del
// servidor; a partir de ahí las notificaciones llegan aunque la app
// esté cerrada. Es idempotente: si ya existe suscripción, se reusa.

function getToken() {
  return localStorage.getItem('ucp_token') || localStorage.getItem('token') || '';
}

async function apiPost(path, body) {
  const res = await fetch(`/api/push${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushDisponible() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Pide permiso (si hace falta) y registra este dispositivo para recibir push.
// Devuelve true si quedó suscrito.
export async function suscribirseAPush() {
  if (!pushDisponible()) return false;
  try {
    if (Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      if (p !== 'granted') return false;
    }
    const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;

    const res = await fetch('/api/push/clave-publica', { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) return false;
    const { clave } = await res.json();

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(clave) });
    }
    await apiPost('/suscribir', sub.toJSON());
    return true;
  } catch (e) {
    console.warn('No se pudo activar push:', e?.message || e);
    return false;
  }
}

// Quita este dispositivo de las suscripciones (opcional, al cerrar sesión)
export async function desuscribirseDePush() {
  if (!pushDisponible()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await apiPost('/desuscribir', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {}
}
