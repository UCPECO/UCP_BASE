// Diagnóstico end-to-end del fichaje por QR. Reproduce exactamente lo que hace
// AdminQr.jsx al crear un código y lo que hace Fichar.jsx al escanearlo.
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const PUERTO = process.env.PORT || 3996;
const BASE = `http://127.0.0.1:${PUERTO}`;
const SECRET = process.env.JWT_SECRET;
const db = new Database(process.env.UCP_DB_PATH);

const tok = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, SECRET, { expiresIn: '1h' });
const H = (u) => ({ Authorization: `Bearer ${tok(u)}`, 'Content-Type': 'application/json' });

const admin = db.prepare(`SELECT id, email, role FROM users WHERE role='admin' LIMIT 1`).get();

// Crear un participante con asignación activa (como lo haría el admin en Personal)
db.prepare(`INSERT OR REPLACE INTO users (id, email, password, full_name, nombre_completo, role, area_asignada, archivado)
            VALUES ('vol-1','vol@ucp.local','x','Voluntario Uno','Voluntario Uno','voluntario','Recolección',0)`).run();
db.prepare(`INSERT OR REPLACE INTO actividades (id, nombre, categoria, horas_asignadas, meta_horas, activo)
            VALUES ('act-1','Limpieza de playa','Recolección',4,480,1)`).run();
db.prepare(`INSERT OR REPLACE INTO asignaciones (id, usuario, actividad, estado, fecha_inicio)
            VALUES ('asig-1','vol-1','act-1','activo','2026-10-01')`).run();
const vol = db.prepare(`SELECT id, email, role FROM users WHERE id='vol-1'`).get();

const post = async (path, body, u) => {
  const r = await fetch(BASE + path, { method: 'POST', headers: H(u), body: JSON.stringify(body) });
  let b = null; try { b = await r.json(); } catch { b = null; }
  return { status: r.status, body: b };
};

const linea = (t) => console.log('\n' + '='.repeat(70) + '\n' + t + '\n' + '='.repeat(70));

// ---------- 1. ¿Qué columnas tiene realmente codigos_qr? ----------
linea('1. ESQUEMA REAL DE codigos_qr TRAS LAS MIGRACIONES');
const cols = db.prepare(`PRAGMA table_info(codigos_qr)`).all().map(c => c.name);
console.log('columnas: ' + cols.join(', '));
console.log('¿tiene token?     ' + cols.includes('token'));
console.log('¿tiene ubicacion? ' + cols.includes('ubicacion'));
console.log('¿tiene area?      ' + cols.includes('area') + '   <- el servidor lee qr.area');
console.log('¿tiene actividad? ' + cols.includes('actividad'));

// ---------- 2. Crear un QR exactamente como AdminQr.jsx ----------
linea('2. CREAR QR COMO LO HACE AdminQr.jsx');
const tokenQr = 'tok-prueba-' + Date.now();
const urlQr = `http://localhost/fichar?t=${tokenQr}`;
const creado = await post('/api/entities/Codigos_QR', {
  nombre: 'QR - Recolección',
  tipo: 'por_area',
  token: tokenQr,
  url: urlQr,
  ubicacion: 'Recolección',
  fecha_expiracion: null,
  creado_por: admin.id,
  activo: true,
  escaneos: 0,
}, admin);
console.log('HTTP ' + creado.status);
const fila = db.prepare(`SELECT * FROM codigos_qr WHERE token = ?`).get(tokenQr);
console.log('¿se guardó con token?  ' + !!fila);
if (fila) {
  console.log('  id            = ' + fila.id);
  console.log('  token         = ' + fila.token);
  console.log('  ubicacion     = ' + JSON.stringify(fila.ubicacion));
  console.log('  actividad     = ' + JSON.stringify(fila.actividad));
  console.log('  codigo        = ' + JSON.stringify(fila.codigo));
  console.log('  activo        = ' + JSON.stringify(fila.activo) + ' (tipo ' + typeof fila.activo + ')');
  console.log('  fecha_expiracion = ' + JSON.stringify(fila.fecha_expiracion));
  console.log('  ¿alguna columna guarda el área?  area=' + JSON.stringify(fila.area) + ' actividad=' + JSON.stringify(fila.actividad) + ' ubicacion=' + JSON.stringify(fila.ubicacion));
}

// ---------- 3. Fichar con ese token (lo que hace Fichar.jsx) ----------
linea('3. FICHAR ESCANEANDO ESE QR (payload idéntico a Fichar.jsx:147)');
const r1 = await post('/api/functions/ProcesarFichajeQR', {
  asignacion_id: 'asig-1', manual: false, area: null, token: tokenQr,
}, vol);
console.log('HTTP ' + r1.status + '  body: ' + JSON.stringify(r1.body));
if (r1.body?.registro) {
  const reg = db.prepare('SELECT * FROM registros_qr WHERE id = ?').get(r1.body.registro.id);
  console.log('  registro guardado:');
  console.log('    area          = ' + JSON.stringify(reg?.area) + '   <- debería ser "Recolección" (el área del QR)');
  console.log('    es_manual     = ' + reg?.es_manual);
  console.log('    estado        = ' + reg?.estado_registro);
  console.log('    hora_entrada  = ' + reg?.hora_entrada);
  console.log('    asignacion    = ' + reg?.asignacion);
}

// ---------- 4. Modos de fallo ----------
linea('4. MODOS DE FALLO DEL QR');

const rSinToken = await post('/api/functions/ProcesarFichajeQR', { asignacion_id: 'asig-1', manual: false, area: null }, vol);
console.log('sin token ni manual      -> HTTP ' + rSinToken.status + '  ' + JSON.stringify(rSinToken.body));

const rTokenFalso = await post('/api/functions/ProcesarFichajeQR', { asignacion_id: 'asig-1', manual: false, area: null, token: 'inexistente' }, vol);
console.log('token inexistente        -> HTTP ' + rTokenFalso.status + '  ' + JSON.stringify(rTokenFalso.body));

// QR con activo NULL (código viejo migrado)
db.prepare(`INSERT INTO codigos_qr (id, token, ubicacion, activo, nombre, tipo) VALUES ('qr-null','tok-null','Recolección',NULL,'QR viejo','por_area')`).run();
const rActivoNull = await post('/api/functions/ProcesarFichajeQR', { asignacion_id: 'asig-1', manual: false, area: null, token: 'tok-null' }, vol);
console.log('activo = NULL            -> HTTP ' + rActivoNull.status + '  ' + JSON.stringify(rActivoNull.body));

// QR expirado ayer
const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
db.prepare(`INSERT INTO codigos_qr (id, token, ubicacion, activo, nombre, tipo, fecha_expiracion) VALUES ('qr-exp','tok-exp','Recolección',1,'QR expirado','por_area',?)`).run(ayer);
const rExpirado = await post('/api/functions/ProcesarFichajeQR', { asignacion_id: 'asig-1', manual: false, area: null, token: 'tok-exp' }, vol);
console.log('expirado ayer (' + ayer + ')  -> HTTP ' + rExpirado.status + '  ' + JSON.stringify(rExpirado.body));

// QR que expira HOY (caso límite)
const hoy = new Date().toISOString().slice(0, 10);
db.prepare(`INSERT INTO codigos_qr (id, token, ubicacion, activo, nombre, tipo, fecha_expiracion) VALUES ('qr-hoy','tok-hoy','Recolección',1,'QR hoy','por_area',?)`).run(hoy);
const rHoy = await post('/api/functions/ProcesarFichajeQR', { asignacion_id: 'asig-1', manual: false, area: null, token: 'tok-hoy' }, vol);
console.log('expira hoy (' + hoy + ')     -> HTTP ' + rHoy.status + '  ' + JSON.stringify(rHoy.body).slice(0, 120));

// ---------- 5. Salida y fichaje manual ----------
linea('5. SALIDA Y FICHAJE MANUAL');
const abierto = db.prepare(`SELECT id FROM registros_qr WHERE usuario='vol-1' AND estado_registro='abierto' LIMIT 1`).get();
if (abierto) {
  const rSal = await post('/api/functions/RegistrarSalidaFichaje', { registro_id: abierto.id, manual: false }, vol);
  console.log('salida                   -> HTTP ' + rSal.status + '  ' + JSON.stringify(rSal.body).slice(0, 200));
} else {
  console.log('salida                   -> no había fichaje abierto que cerrar');
}
const rMan = await post('/api/functions/ProcesarFichajeQR', { asignacion_id: 'asig-1', manual: true, area: 'Recolección', token: null }, vol);
console.log('manual con área          -> HTTP ' + rMan.status + '  ' + JSON.stringify(rMan.body).slice(0, 200));

linea('6. CONFIGURACIÓN DE HORARIO QUE AFECTA AL FICHAJE');
const cfg = db.prepare('SELECT * FROM configuracion_sistema LIMIT 1').get();
console.log(JSON.stringify(cfg, null, 2));
console.log('\nFecha/hora del servidor (UTC): ' + new Date().toISOString());
console.log('Fecha/hora en México:          ' + new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }));

db.close();
