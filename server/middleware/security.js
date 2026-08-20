// Medidas de seguridad del servidor: headers HTTP, rate limiting por IP,
// bloqueo temporal por intentos fallidos de login y captcha anti-bots.
// Todo en memoria (el servidor es un solo proceso en Hostinger); los contadores
// se reinician al reiniciar el proceso, lo cual es aceptable para este uso.
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';

// ===== Headers de seguridad HTTP =====
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(), microphone=()');
  // CSP: la app es un bundle propio sin scripts de terceros. Se permiten
  // imágenes data:/blob: (fotos de evidencias y QRs generados en canvas).
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
    "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  );
  next();
}

// ===== Rate limiter genérico por IP =====
export function rateLimit({ windowMs, max, mensaje }) {
  const hits = new Map(); // ip -> { count, reset }
  // Limpieza periódica para no crecer sin límite
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'desconocida';
    const now = Date.now();
    let rec = hits.get(ip);
    if (!rec || rec.reset <= now) {
      rec = { count: 0, reset: now + windowMs };
      hits.set(ip, rec);
    }
    rec.count += 1;
    if (rec.count > max) {
      const espera = Math.ceil((rec.reset - now) / 1000);
      res.setHeader('Retry-After', String(espera));
      return res.status(429).json({ error: mensaje || `Demasiadas solicitudes. Intenta de nuevo en ${espera} s.` });
    }
    next();
  };
}

// ===== Bloqueo temporal de login por intentos fallidos =====
const MAX_FALLOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000; // 15 minutos
const fallos = new Map(); // email|ip -> { count, bloqueadoHasta }

function claveLogin(email, ip) {
  return `${String(email || '').toLowerCase().trim()}|${ip}`;
}

export function loginBloqueado(email, ip) {
  const rec = fallos.get(claveLogin(email, ip));
  if (!rec) return 0;
  if (rec.bloqueadoHasta && rec.bloqueadoHasta > Date.now()) {
    return Math.ceil((rec.bloqueadoHasta - Date.now()) / 1000);
  }
  return 0;
}

export function registrarFalloLogin(email, ip) {
  const k = claveLogin(email, ip);
  const rec = fallos.get(k) || { count: 0, bloqueadoHasta: 0 };
  rec.count += 1;
  if (rec.count >= MAX_FALLOS) {
    rec.bloqueadoHasta = Date.now() + BLOQUEO_MS;
    rec.count = 0;
    registrarEnBitacora(null, 'Bloqueo de login', 'Seguridad', `5+ intentos fallidos para ${email} desde ${ip}; bloqueado 15 min`);
  }
  fallos.set(k, rec);
  return MAX_FALLOS - rec.count;
}

export function limpiarFallosLogin(email, ip) {
  fallos.delete(claveLogin(email, ip));
}

// ===== Captcha matemático anti-bots (de un solo uso, caduca en 5 min) =====
const captchas = new Map(); // id -> { respuesta, expira }
const CAPTCHA_TTL = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of captchas) if (v.expira <= now) captchas.delete(k);
}, 60 * 1000).unref();

export function generarCaptcha() {
  const a = 2 + Math.floor(Math.random() * 8); // 2-9
  const b = 1 + Math.floor(Math.random() * 9); // 1-9
  const resta = a >= 5 && Math.random() < 0.4; // mezcla sumas y restas (sin negativos)
  const id = uuidv4();
  captchas.set(id, { respuesta: resta ? a - b : a + b, expira: Date.now() + CAPTCHA_TTL });
  return { id, pregunta: resta ? `¿Cuánto es ${a} − ${b}?` : `¿Cuánto es ${a} + ${b}?` };
}

export function verificarCaptcha(id, respuesta) {
  if (!id) return false;
  const rec = captchas.get(id);
  captchas.delete(id); // un solo uso, acierte o no
  if (!rec || rec.expira <= Date.now()) return false;
  return Number(respuesta) === rec.respuesta;
}

// ===== Bitácora interna (eventos de seguridad) =====
export function registrarEnBitacora(usuarioId, accion, modulo, detalles) {
  try {
    db.prepare(
      'INSERT INTO bitacora_auditoria (id, usuario, accion, modulo, detalles) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), usuarioId || null, accion, modulo || 'Seguridad', detalles || '');
  } catch { /* la bitácora nunca debe romper el flujo principal */ }
}
