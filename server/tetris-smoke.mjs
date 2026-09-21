// Prueba de humo de la API de Tetris y del bundle servido.
// Uso: arrancar el servidor y luego `node tetris-smoke.mjs`.
// Requiere las variables PORT, JWT_SECRET y UCP_DB_PATH apuntando al servidor.
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const PUERTO = process.env.PORT || 3998;
const BASE = `http://127.0.0.1:${PUERTO}`;
const SECRET = process.env.JWT_SECRET;
const db = new Database(process.env.UCP_DB_PATH);

const admin = db.prepare(`SELECT id, email, role FROM users WHERE role='admin' LIMIT 1`).get();
if (!admin) { console.log('FALLO: no hay usuario admin en la BD'); process.exit(1); }
const H = {
  Authorization: `Bearer ${jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, SECRET, { expiresIn: '1h' })}`,
  'Content-Type': 'application/json',
};

let ok = 0, mal = 0;
const t = async (nombre, esperado, fn) => {
  try {
    const r = await fn();
    const p = r.status === esperado;
    console.log(`${p ? 'OK  ' : 'FALLO'} ${nombre} -> ${r.status} (esperado ${esperado})${p ? '' : '  ' + JSON.stringify(r.body).slice(0, 150)}`);
    p ? ok++ : mal++;
    return r;
  } catch (e) { console.log(`FALLO ${nombre} -> excepción: ${e.message}`); mal++; return null; }
};
const afirma = (nombre, cond) => {
  console.log(`${cond ? 'OK  ' : 'FALLO'} ${nombre}`);
  cond ? ok++ : mal++;
};
const call = async (p, o = {}) => {
  const res = await fetch(BASE + p, { headers: H, ...o });
  let b = null; try { b = await res.json(); } catch { b = null; }
  return { status: res.status, body: b };
};

console.log('\n=== ESQUEMA CREADO AUTOMÁTICAMENTE ===');
const cols = db.prepare(`PRAGMA table_info(tetris_puntajes)`).all().map((c) => c.name);
console.log('columnas: ' + cols.join(', '));
afirma('tabla tetris_puntajes con sus columnas', cols.includes('puntos') && cols.includes('usuario') && cols.includes('duracion_seg'));
const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tetris_puntajes'`).all().map((r) => r.name);
console.log('índices: ' + idx.join(', '));
afirma('índices de ranking creados', idx.includes('idx_tetris_puntos') && idx.includes('idx_tetris_usuario'));

console.log('\n=== AUTENTICACIÓN ===');
await t('ranking sin token -> 401', 401, async () => ({ status: (await fetch(BASE + '/api/tetris/ranking')).status }));

console.log('\n=== REGISTRO DE PARTIDAS ===');
const r0 = await t('ranking inicial -> 200', 200, () => call('/api/tetris/ranking'));
if (r0?.body) afirma('ranking empieza vacío', r0.body.total_jugadores === 0 && r0.body.ranking.length === 0);

const p1 = await t('POST puntaje 1200 -> 201', 201, () => call('/api/tetris/puntaje', {
  method: 'POST', body: JSON.stringify({ puntos: 1200, lineas: 8, nivel: 2, piezas: 40, duracion_seg: 180 }),
}));
if (p1?.body) afirma('devuelve récord personal y posición', p1.body.es_record_personal === true && p1.body.posicion_global === 1);
await t('POST puntaje 4800 -> 201', 201, () => call('/api/tetris/puntaje', {
  method: 'POST', body: JSON.stringify({ puntos: 4800, lineas: 24, nivel: 3, piezas: 95, duracion_seg: 420 }),
}));
await t('POST puntaje 300 (peor) -> 201', 201, () => call('/api/tetris/puntaje', {
  method: 'POST', body: JSON.stringify({ puntos: 300, lineas: 3, nivel: 1, piezas: 20, duracion_seg: 90 }),
}));

console.log('\n=== VALIDACIONES ===');
await t('puntos negativos -> 400', 400, () => call('/api/tetris/puntaje', { method: 'POST', body: JSON.stringify({ puntos: -50, piezas: 10 }) }));
await t('puntos absurdos (1e9) -> 400', 400, () => call('/api/tetris/puntaje', { method: 'POST', body: JSON.stringify({ puntos: 1e9, piezas: 10 }) }));
await t('puntos sin piezas -> 400', 400, () => call('/api/tetris/puntaje', { method: 'POST', body: JSON.stringify({ puntos: 5000, lineas: 10, piezas: 0 }) }));
await t('más líneas que piezas -> 400', 400, () => call('/api/tetris/puntaje', { method: 'POST', body: JSON.stringify({ puntos: 900, lineas: 50, piezas: 10 }) }));
await t('puntos no numéricos -> 400', 400, () => call('/api/tetris/puntaje', { method: 'POST', body: JSON.stringify({ puntos: 'muchos', piezas: 10 }) }));

console.log('\n=== RANKING GLOBAL ===');
const r1 = await t('ranking con datos -> 200', 200, () => call('/api/tetris/ranking'));
if (r1?.body) {
  console.log(`      total_jugadores=${r1.body.total_jugadores}  total_partidas=${r1.body.total_partidas}`);
  for (const f of r1.body.ranking) {
    console.log(`      #${f.posicion} ${f.nombre}: ${f.puntos} pts (${f.lineas} líneas, nivel ${f.nivel}) soy_yo=${f.soy_yo}`);
  }
  afirma('publica el MEJOR puntaje (4800), no el último (300)', r1.body.ranking[0]?.puntos === 4800);
  afirma('una sola fila por usuario', r1.body.ranking.length === 1);
  afirma('mi posición global es 1', r1.body.mio?.posicion === 1);
  afirma('el nombre lo resuelve el servidor', typeof r1.body.ranking[0]?.nombre === 'string' && r1.body.ranking[0].nombre.length > 0);
}
const r2 = await t('mios -> 200', 200, () => call('/api/tetris/mios'));
if (r2?.body) afirma('las 3 partidas están en el historial', r2.body.partidas.length === 3);

console.log('\n=== BORRADO ===');
await t('borrar partida inexistente -> 404', 404, () => call('/api/tetris/puntaje/id-inexistente', { method: 'DELETE' }));
const idBorrar = r2?.body?.partidas?.[0]?.id;
if (idBorrar) await t('borrar mi partida -> 200', 200, () => call('/api/tetris/puntaje/' + idBorrar, { method: 'DELETE' }));

console.log('\n=== BUNDLE SERVIDO ===');
await t('GET / sirve index.html -> 200', 200, async () => {
  const r = await fetch(BASE + '/');
  if (!(await r.text()).includes('<div id="root">')) throw new Error('no es el index.html');
  return { status: r.status };
});
await t('GET /tetris cae en la SPA -> 200', 200, async () => {
  const r = await fetch(BASE + '/tetris');
  if (!(await r.text()).includes('<div id="root">')) throw new Error('no es el index.html');
  return { status: r.status };
});
await t('404 de la API es JSON (BUG-23) -> 404', 404, async () => {
  const r = await fetch(BASE + '/api/tetris/ruta-inexistente', { headers: H });
  const b = await r.json().catch(() => null);
  if (!b || b.error === undefined) throw new Error('no es JSON de error');
  return { status: r.status };
});

console.log(`\n=== RESULTADO: ${ok} correctas, ${mal} fallidas ===`);
// Ver el comentario equivalente en smoke-test.mjs: salir de forma natural evita
// un assert de libuv en el teardown que mancharía el código de salida.
db.close();
process.exitCode = mal > 0 ? 1 : 0;
