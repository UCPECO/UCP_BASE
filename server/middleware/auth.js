import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { db } from '../database.js';

// En producción debe definirse JWT_SECRET (variable de entorno).
// Si no existe, se genera una aleatoria por proceso: más seguro que una
// llave por defecto visible en el código (las sesiones se reinician al
// reiniciar el servidor, pero nadie puede falsificar tokens).
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET no definido; usando llave aleatoria temporal. Configura la variable de entorno JWT_SECRET en producción.');
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
  
  req.user = decoded;
  registrarPresencia(decoded.id);
  next();
}

// Presencia ("en línea"): actualiza users.ultima_actividad como mucho una
// vez por minuto por usuario para no escribir en la BD en cada petición.
const ultimaVez = new Map();
function registrarPresencia(userId) {
  if (!userId) return;
  const ahora = Date.now();
  if (ahora - (ultimaVez.get(userId) || 0) < 60 * 1000) return;
  ultimaVez.set(userId, ahora);
  try {
    db.prepare(`UPDATE users SET ultima_actividad = datetime('now') WHERE id = ?`).run(userId);
  } catch { /* presencia es best-effort */ }
}

export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) req.user = decoded;
  }
  
  next();
}

export { JWT_SECRET };
