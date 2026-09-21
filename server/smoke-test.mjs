// Prueba de humo de los arreglos. Se ejecuta con el servidor ya arrancado.
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const BASE = 'http://127.0.0.1:3999';
const SECRET = process.env.JWT_SECRET;
const db = new Database(process.env.UCP_DB_PATH);

const admin = db.prepare(`SELECT id, email, role FROM users WHERE role = 'admin' LIMIT 1`).get();
if (!admin) { console.log('FALLO: no hay usuario admin en la BD'); process.exit(1); }
const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, SECRET, { expiresIn: '1h' });
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

let ok = 0, mal = 0;
async function check(nombre, esperado, fn) {
  try {
    const r = await fn();
    const pasa = r.status === esperado;
    console.log(`${pasa ? 'OK  ' : 'FALLO'} ${nombre} -> ${r.status} (esperado ${esperado})${pasa ? '' : ' body=' + JSON.stringify(r.body).slice(0, 160)}`);
    pasa ? ok++ : mal++;
  } catch (e) {
    console.log(`FALLO ${nombre} -> excepción: ${e.message}`);
    mal++;
  }
}
const call = async (path, opts = {}) => {
  const res = await fetch(BASE + path, { headers: H, ...opts });
  let body = null;
  try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
  return { status: res.status, body };
};

console.log(`\n=== admin de prueba: ${admin.email} (${admin.id.slice(0, 8)}…) ===\n`);

// BUG-23: los 404 de la API deben ser JSON, no el index.html de la SPA
await check('BUG-23  GET /api/ruta-inexistente es JSON 404', 404, async () => {
  const r = await call('/api/ruta-inexistente');
  if (typeof r.body === 'string' || r.body?.error === undefined) throw new Error('no es JSON de error');
  return r;
});

// LIB-02: PUT /:entity/bulk ya no la sombrea /:entity/:id
// BUG-04: sin filter debe rechazarse con 400 (antes: UPDATE sin WHERE)
await check('LIB-02+BUG-04  bulk sin filter -> 400', 400, () =>
  call('/api/entities/Actividades/bulk', { method: 'PUT', body: JSON.stringify({ $set: { nombre: 'x' } }) }));

await check('BUG-04  bulk con filter vacío -> 400', 400, () =>
  call('/api/entities/Actividades/bulk', { method: 'PUT', body: JSON.stringify({ filter: {}, $set: { nombre: 'x' } }) }));

await check('LIB-02  bulk con filter válido ya no da 404', 200, () =>
  call('/api/entities/Actividades/bulk', { method: 'PUT', body: JSON.stringify({ filter: { categoria: '__no_existe__' }, $set: { descripcion: 'prueba' } }) }));

// BUG-02: fichaje sin token de QR debe rechazarse
await check('BUG-02  ProcesarFichajeQR sin token -> 400', 400, () =>
  call('/api/functions/ProcesarFichajeQR', { method: 'POST', body: JSON.stringify({ asignacion_id: 'cualquiera' }) }));

await check('BUG-02  ProcesarFichajeQR con token falso -> 200 con error de QR', 200, async () => {
  const r = await call('/api/functions/ProcesarFichajeQR', { method: 'POST', body: JSON.stringify({ asignacion_id: 'x', token: 'inexistente' }) });
  if (!r.body?.error) throw new Error('se esperaba error de QR no reconocido');
  return r;
});

// BUG-15: RevisarIncidenciasSemanales ya exige rol (admin sí puede)
await check('BUG-15  RevisarIncidenciasSemanales como admin -> 200', 200, () =>
  call('/api/functions/RevisarIncidenciasSemanales', { method: 'POST', body: '{}' }));

// BUG-05: un token de sesión ya NO sirve para restablecer contraseña
await check('BUG-05  reset-password con token de sesión -> 401', 401, () =>
  call('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ resetToken: token, newPassword: 'nueva123' }) }));

// LIB-01: el filtro booleano ahora viaja como 1/0
const qs = new URLSearchParams();
await check('LIB-01  GET /api/entities/Encuestas?activa=1 responde 200', 200, () =>
  call('/api/entities/Encuestas?activa=1'));

// BUG-10: el polling del chat usa >= (no debe dar error)
await check('BUG-10  mensajes del canal general -> 200', 200, () =>
  call('/api/mensajes/canal/general/mensajes?desde=' + encodeURIComponent('2000-01-01 00:00:00')));

console.log(`\n=== RESULTADO: ${ok} correctas, ${mal} fallidas ===`);
process.exit(mal > 0 ? 1 : 0);
