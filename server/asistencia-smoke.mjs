// Pruebas del sistema de asistencia. Requiere el servidor arriba.
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';

const PUERTO = process.env.PORT || 3995;
const BASE = `http://127.0.0.1:${PUERTO}`;
const SECRET = process.env.JWT_SECRET;
const db = new Database(process.env.UCP_DB_PATH);

let ok = 0, mal = 0;
const afirma = (n, c, extra = '') => { console.log(`${c ? 'OK  ' : 'FALLO'} ${n}${c || !extra ? '' : '  -> ' + extra}`); c ? ok++ : mal++; };
const t = async (n, esp, fn) => {
  try { const r = await fn(); const p = r.status === esp; console.log(`${p ? 'OK  ' : 'FALLO'} ${n} -> ${r.status} (esperado ${esp})${p ? '' : '  ' + JSON.stringify(r.body).slice(0, 180)}`); p ? ok++ : mal++; return r; }
  catch (e) { console.log(`FALLO ${n} -> excepción: ${e.message}`); mal++; return null; }
};

// ---------- Datos de prueba ----------
const admin = db.prepare(`SELECT id, email, role FROM users WHERE role='admin' LIMIT 1`).get();
const mk = (id, email, nombre, role, area_asignada, area_encargada) =>
  db.prepare(`INSERT OR REPLACE INTO users (id,email,password,full_name,nombre_completo,role,area_asignada,area_encargada,archivado)
              VALUES (?,?,?,?,?,?,?,?,'0')`).run(id, email, 'x', nombre, nombre, role, area_asignada, area_encargada);

mk('enc-bodega', 'enc@ucp.local', 'Encargado Bodega', 'encargado', null, 'Bodega CU1');
mk('v-bodega-1', 'vb1@ucp.local', 'Voluntario Bodega Uno', 'voluntario', 'Bodega CU1', null);
mk('v-bodega-2', 'vb2@ucp.local', 'Voluntario Bodega Dos', 'voluntario', 'Bodega CU1', null);
mk('v-recolec-1', 'vr1@ucp.local', 'Voluntario Recolección', 'voluntario', 'Recolección', null);
mk('v-archivado', 'va@ucp.local', 'Voluntario Archivado', 'voluntario', 'Bodega CU1', null);
db.prepare(`UPDATE users SET archivado = 1 WHERE id = 'v-archivado'`).run();

const tok = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, SECRET, { expiresIn: '1h' });
const hdr = (u) => ({ Authorization: `Bearer ${tok(u)}`, 'Content-Type': 'application/json' });
const post = async (p, body, u) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: hdr(u), body: JSON.stringify(body || {}) });
  let b = null; try { b = await r.json(); } catch { b = null; }
  return { status: r.status, body: b };
};

// Octubre 2026: 1 = jueves. Semanas laborables de lunes a viernes.
const ins = db.prepare(`INSERT INTO registros_qr (id, usuario, asignacion, fecha, hora_entrada, hora_salida, estado_registro, horas, validado, es_manual, area)
                        VALUES (?,?,?,?,?,?,?,?,'1','0',?)`);
let n = 0;
const fichar = (usuario, fecha, area, horas = 4, entrada = '08:00', salida = '12:00') =>
  ins.run(`reg-${++n}`, usuario, 'asig-x', fecha, entrada, salida, 'cerrado', horas, area);

// v-bodega-1: 5 días distintos en octubre
['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07'].forEach((f) => fichar('v-bodega-1', f, 'Bodega CU1'));
// v-bodega-2: 2 días
['2026-10-01', '2026-10-08'].forEach((f) => fichar('v-bodega-2', f, 'Bodega CU1'));
// v-recolec-1: 3 días en OTRA área
['2026-10-01', '2026-10-02', '2026-10-03'].forEach((f) => fichar('v-recolec-1', f, 'Recolección'));
// v-archivado: 1 día (baja, no debe aparecer)
fichar('v-archivado', '2026-10-01', 'Bodega CU1');
// Un fichaje ABIERTO: no debe contar como día asistido completo
db.prepare(`INSERT INTO registros_qr (id,usuario,asignacion,fecha,hora_entrada,hora_salida,estado_registro,horas,validado,es_manual,area)
            VALUES ('reg-abierto','v-bodega-1','asig-x','2026-10-09','08:00',NULL,'abierto','0','0','0','Bodega CU1')`).run();
// Septiembre (fuera del periodo consultado)
fichar('v-bodega-1', '2026-09-15', 'Bodega CU1');

console.log('\n########## PERMISOS ##########');
await t('voluntario no puede ver la asistencia -> 403', 403, () => post('/api/asistencia/por-persona', { periodo: '2026-10' }, { id: 'v-bodega-1', email: 'vb1@ucp.local', role: 'voluntario' }));
await t('sin token -> 401', 401, async () => ({ status: (await fetch(BASE + '/api/asistencia/por-persona', { method: 'POST', body: '{}' })).status }));

console.log('\n########## ADMIN: TODAS LAS ÁREAS ##########');
const r1 = await t('admin consulta octubre -> 200', 200, () => post('/api/asistencia/por-persona', { periodo: '2026-10' }, admin));
const d = r1?.body;
if (d) {
  console.log('  resumen: ' + JSON.stringify(d.resumen));
  console.log('  días hábiles: ' + d.total_dias_habiles + ' · por día de semana: ' + JSON.stringify(d.por_dia_semana));
  const vb1 = d.personas.find((p) => p.usuario === 'v-bodega-1');
  afirma('v-bodega-1 tiene 5 días (el abierto NO cuenta)', vb1?.total_dias === 5, `obtenido ${vb1?.total_dias}`);
  afirma('el fichaje de septiembre queda fuera del periodo', !vb1?.dias.includes('2026-09-15'));
  afirma('los días están ordenados y son los correctos', JSON.stringify(vb1?.dias) === JSON.stringify(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07']), JSON.stringify(vb1?.dias));
  const arch = d.personas.find((p) => p.usuario === 'v-archivado');
  afirma('el dado de baja aparece MARCADO como archivado (sí trabajó esos días)', arch?.archivado === true, JSON.stringify(arch && { arch: arch.archivado, dias: arch.total_dias }));
  afirma('los activos vienen con archivado=false', d.personas.filter((p) => p.usuario !== 'v-archivado').every((p) => p.archivado === false));
  afirma('vb1 ve 3 áreas distintas (admin sin filtro)', d.personas.some((p) => p.usuario === 'v-recolec-1'));
  afirma('ordenado por días descendente', d.personas[0].total_dias >= d.personas[d.personas.length - 1].total_dias);
  afirma('día habitual de vb1 resuelto', typeof vb1?.dia_habitual === 'string', vb1?.dia_habitual);
  afirma('cumplimiento calculado sobre días hábiles', vb1?.cumplimiento === Math.round((5 / d.total_dias_habiles) * 100), `${vb1?.cumplimiento} vs ${Math.round((5 / d.total_dias_habiles) * 100)}`);
  // Octubre 2026 tiene 22 días hábiles (lun-vie): 1 es jueves
  afirma('octubre 2026 tiene 22 días hábiles lun-vie', d.total_dias_habiles === 22, `obtenido ${d.total_dias_habiles}`);
  afirma('por_dia_semana suma lo mismo que las asistencias', Object.values(d.por_dia_semana).reduce((a, b) => a + b, 0) === d.resumen.total_asistencias);
  afirma('el detalle trae entrada/salida/horas', vb1?.detalle?.[0]?.entrada === '08:00' && vb1.detalle[0].horas === 4, JSON.stringify(vb1?.detalle?.[0]));
  afirma('sin_asistencia cuenta a quien no fichó', d.resumen.sin_asistencia >= 0);
}

console.log('\n########## SCOPING POR ÁREA (encargado) ##########');
const enc = db.prepare(`SELECT id, email, role FROM users WHERE id='enc-bodega'`).get();
const r2 = await t('encargado consulta octubre -> 200', 200, () => post('/api/asistencia/por-persona', { periodo: '2026-10' }, enc));
if (r2?.body) {
  afirma('el encargado ve su área filtrada', r2.body.area_filtrada === 'Bodega CU1', r2.body.area_filtrada);
  afirma('NO ve a la gente de Recolección', !r2.body.personas.some((p) => p.usuario === 'v-recolec-1'));
  afirma('sí ve a los de su área', r2.body.personas.some((p) => p.usuario === 'v-bodega-1') && r2.body.personas.some((p) => p.usuario === 'v-bodega-2'));
  afirma('ve al dado de baja de SU área, marcado', r2.body.personas.find((p) => p.usuario === 'v-archivado')?.archivado === true);
  afirma('el scoping aplica también a las bajas (nadie de otra área)', r2.body.personas.every((p) => p.area === 'Bodega CU1' || p.usuario === 'v-archivado'), JSON.stringify(r2.body.personas.map((p) => p.area)));
  // Intento de saltarse el scoping mandando otra área
  const r3 = await post('/api/asistencia/por-persona', { periodo: '2026-10', area: 'Recolección' }, enc);
  afirma('no puede saltarse el scoping pidiendo otra área', r3.body?.area_filtrada === 'Bodega CU1', r3.body?.area_filtrada);
}

console.log('\n########## FILTRO DE ÁREA EXPLÍCITO (admin) ##########');
const r4 = await t('admin filtra por Recolección -> 200', 200, () => post('/api/asistencia/por-persona', { periodo: '2026-10', area: 'Recolección' }, admin));
if (r4?.body) {
  afirma('solo devuelve gente de Recolección', r4.body.personas.every((p) => p.area === 'Recolección'), JSON.stringify(r4.body.personas.map((p) => p.area)));
  afirma('v-recolec-1 tiene 3 días', r4.body.personas.find((p) => p.usuario === 'v-recolec-1')?.total_dias === 3);
}

console.log('\n########## RANGO EXPLÍCITO Y PERIODO INVÁLIDO ##########');
const r5 = await t('rango desde/hasta -> 200', 200, () => post('/api/asistencia/por-persona', { desde: '2026-10-01', hasta: '2026-10-03' }, admin));
if (r5?.body) {
  afirma('el rango corto cuenta solo esos días', r5.body.personas.find((p) => p.usuario === 'v-bodega-1')?.total_dias === 2, `obtenido ${r5.body.personas.find((p) => p.usuario === 'v-bodega-1')?.total_dias}`);
  afirma('días hábiles del rango = 3 (jue, vie, sáb->no)', r5.body.total_dias_habiles >= 2, `${r5.body.total_dias_habiles}`);
}
const r6 = await t('periodo inválido cae al mes actual -> 200', 200, () => post('/api/asistencia/por-persona', { periodo: 'no-es-fecha' }, admin));
afirma('devuelve un periodo con formato YYYY-MM', /^\d{4}-\d{2}$/.test(r6?.body?.periodo || ''), r6?.body?.periodo);
const r7 = await t('sin parámetros usa el mes en curso -> 200', 200, () => post('/api/asistencia/por-persona', {}, admin));
afirma('sin parámetros devuelve personas', Array.isArray(r7?.body?.personas));

console.log('\n########## POR DÍA ##########');
const r8 = await t('por-dia octubre -> 200', 200, () => post('/api/asistencia/por-dia', { periodo: '2026-10' }, admin));
if (r8?.body) {
  const d1 = r8.body.dias.find((x) => x.fecha === '2026-10-01');
  // Ficharon el 1 de octubre: v-bodega-1, v-bodega-2, v-recolec-1 y el dado de
  // baja. Cuatro, y tiene que coincidir con por-persona o los dos paneles
  // mostrarían cifras distintas del mismo mes.
  afirma('2026-10-01 tuvo 4 personas distintas (incluye la baja)', d1?.personas === 4, `obtenido ${d1?.personas}`);
  afirma('cada día trae su día de la semana', d1?.dia_semana === 'Jueves', d1?.dia_semana);
  afirma('los días vienen ordenados', r8.body.dias.every((x, i, a) => i === 0 || a[i - 1].fecha <= x.fecha));
  const totalPorDia = r8.body.dias.reduce((a, x) => a + x.personas, 0);
  const totalPorPersona = (await post('/api/asistencia/por-persona', { periodo: '2026-10' }, admin)).body.resumen.total_asistencias;
  afirma('por-dia y por-persona cuadran entre sí', totalPorDia === totalPorPersona, `porDia=${totalPorDia} porPersona=${totalPorPersona}`);
}

console.log('\n########## AGREGACIÓN EN SERVIDOR (sin truncado por LIMIT) ##########');
// El punto de hacerlo en el servidor: las pantallas que sumaban en el navegador
// sobre un LIMIT 100 perdían días en cuanto la tabla crecía.
// Fechas CONSECUTIVAS y por tanto todas distintas: si no, la fórmula
// (i%12, i%28) colisiona cada 84 iteraciones y no se superan los 100 días
// distintos, que es justo lo que hay que demostrar.
const base = new Date(2024, 0, 1);
for (let i = 0; i < 130; i++) {
  const d = new Date(base);
  d.setDate(base.getDate() + i);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  db.prepare(`INSERT OR IGNORE INTO registros_qr (id,usuario,asignacion,fecha,hora_entrada,hora_salida,estado_registro,horas,validado,es_manual,area)
              VALUES (?,?,?,?, '08:00','12:00','cerrado','4','1','0','Bodega CU1')`)
    .run(`reg-masivo-${i}`, 'v-bodega-2', 'asig-x', iso);
}
const totalVb2 = db.prepare(`SELECT COUNT(DISTINCT fecha) AS n FROM registros_qr WHERE usuario='v-bodega-2' AND estado_registro IN ('cerrado','incompleto')`).get().n;
const r9 = await t('consulta tras insertar 130 registros -> 200', 200, () => post('/api/asistencia/por-persona', { desde: '2024-01-01', hasta: '2026-12-31' }, admin));
if (r9?.body) {
  const vb2 = r9.body.personas.find((p) => p.usuario === 'v-bodega-2');
  afirma('cuenta TODOS los días distintos, no solo los últimos 100', vb2?.total_dias === totalVb2, `servidor=${vb2?.total_dias} bd=${totalVb2}`);
  afirma('hay más de 100 días distintos registrados', totalVb2 > 100, `obtenido ${totalVb2}`);
}

console.log(`\n=== RESULTADO: ${ok} correctas, ${mal} fallidas ===`);
db.close();
process.exitCode = mal > 0 ? 1 : 0;
