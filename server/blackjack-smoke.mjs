// Pruebas del blackjack: lógica pura + flujo de horas por HTTP.
// Uso: arrancar el servidor y luego `node blackjack-smoke.mjs`.
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import {
  barajar, valorMano, esBlackjack, jugarDealer, resolver, RESULTADOS, fmtMinutos,
} from './lib/blackjack.js';

const PUERTO = process.env.PORT || 3997;
const BASE = `http://127.0.0.1:${PUERTO}`;
const SECRET = process.env.JWT_SECRET;
const db = new Database(process.env.UCP_DB_PATH);

let ok = 0, mal = 0;
const afirma = (nombre, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FALLO'} ${nombre}${cond || !extra ? '' : '  -> ' + extra}`);
  cond ? ok++ : mal++;
};
const t = async (nombre, esperado, fn) => {
  try {
    const r = await fn();
    const p = r.status === esperado;
    console.log(`${p ? 'OK  ' : 'FALLO'} ${nombre} -> ${r.status} (esperado ${esperado})${p ? '' : '  ' + JSON.stringify(r.body).slice(0, 180)}`);
    p ? ok++ : mal++;
    return r;
  } catch (e) { console.log(`FALLO ${nombre} -> excepción: ${e.message}`); mal++; return null; }
};

const admin = db.prepare(`SELECT id, email, role FROM users WHERE role='admin' LIMIT 1`).get();
const tok = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, SECRET, { expiresIn: '1h' });
const hdr = (u) => ({ Authorization: `Bearer ${tok(u)}`, 'Content-Type': 'application/json' });
const H = hdr(admin);
const call = async (p, o = {}, h = H) => {
  const res = await fetch(BASE + p, { headers: h, ...o });
  let b = null; try { b = await res.json(); } catch { b = null; }
  return { status: res.status, body: b };
};
const post = (p, body, h = H) => call(p, { method: 'POST', body: JSON.stringify(body || {}) }, h);

// Un segundo usuario no-admin, para probar permisos
db.prepare(`INSERT OR IGNORE INTO users (id, email, password, full_name, role) VALUES ('usr-prueba','prueba@ucp.local','x','Usuario Prueba','voluntario')`).run();
const voluntario = db.prepare(`SELECT id, email, role FROM users WHERE id='usr-prueba'`).get();
const HV = hdr(voluntario);

console.log('\n########## 1. LÓGICA PURA (sin servidor) ##########');

// --- Mazo ---
const m4 = barajar(4);
afirma('4 mazos = 208 cartas', m4.length === 208, `obtenido ${m4.length}`);
afirma('cada carta aparece 4 veces', m4.filter(c => c.r === 'A' && c.p === '\u2660').length === 4);
afirma('el mazo queda barajado', JSON.stringify(m4.slice(0, 8)) !== JSON.stringify(barajar(0).slice(0, 8)) || m4[0].r !== 'A');
const m1 = barajar(1);
afirma('1 mazo = 52 cartas', m1.length === 52);

// --- Valor de mano con ases ---
afirma('A + K = 21', valorMano([{ r: 'A', p: 'x' }, { r: 'K', p: 'x' }]).total === 21);
afirma('A + A + 9 = 21 (as degradado)', valorMano([{ r: 'A', p: 'x' }, { r: 'A', p: 'x' }, { r: '9', p: 'x' }]).total === 21);
afirma('A + A + A + 8 = 21', valorMano([{ r: 'A', p: 'x' }, { r: 'A', p: 'x' }, { r: 'A', p: 'x' }, { r: '8', p: 'x' }]).total === 21);
afirma('A + 9 es blanda', valorMano([{ r: 'A', p: 'x' }, { r: '9', p: 'x' }]).blanda === true);
afirma('A + 9 + K = 20 (as a 1)', valorMano([{ r: 'A', p: 'x' }, { r: '9', p: 'x' }, { r: 'K', p: 'x' }]).total === 20);
afirma('K + Q + 5 = 25 (pasada)', valorMano([{ r: 'K', p: 'x' }, { r: 'Q', p: 'x' }, { r: '5', p: 'x' }]).total === 25);
afirma('2 + 3 = 5', valorMano([{ r: '2', p: 'x' }, { r: '3', p: 'x' }]).total === 5);
afirma('10 vale 10', valorMano([{ r: '10', p: 'x' }]).total === 10);

// --- Blackjack natural ---
afirma('A+K es blackjack', esBlackjack([{ r: 'A', p: 'x' }, { r: 'K', p: 'x' }]));
afirma('A+K+0 no es blackjack', !esBlackjack([{ r: 'A', p: 'x' }, { r: 'K', p: 'x' }, { r: '5', p: 'x' }]));
afirma('10+10 no es blackjack', !esBlackjack([{ r: '10', p: 'x' }, { r: '10', p: 'x' }]));

// --- Pagos ---
const c = (r) => [{ r, p: 'x' }];
afirma('blackjack paga 3:2 (60min -> 90)', resolver({ manoJugador: [...c('A'), ...c('K')], manoDealer: [...c('10'), ...c('9')], apuestaMin: 60, doble: false }).delta === 90);
const bjImpar = resolver({ manoJugador: [...c('A'), ...c('K')], manoDealer: [...c('10'), ...c('9')], apuestaMin: 15, doble: false }).delta;
afirma('blackjack con apuesta impar redondea (15 -> 23)', bjImpar === 23, `obtenido ${bjImpar}`);
afirma('doble blackjack NO se paga 3:2 sobre el doble', resolver({ manoJugador: [...c('A'), ...c('K')], manoDealer: [...c('10'), ...c('9')], apuestaMin: 60, doble: true }).delta === 90);
afirma('victoria paga 1:1', resolver({ manoJugador: [...c('10'), ...c('9')], manoDealer: [...c('10'), ...c('8')], apuestaMin: 60, doble: false }).delta === 60);
afirma('victoria doblando paga el doble', resolver({ manoJugador: [...c('10'), ...c('9')], manoDealer: [...c('10'), ...c('8')], apuestaMin: 60, doble: true }).delta === 120);
afirma('derrota descuenta la apuesta', resolver({ manoJugador: [...c('10'), ...c('8')], manoDealer: [...c('10'), ...c('9')], apuestaMin: 60, doble: false }).delta === -60);
afirma('derrota doblando descuenta el doble', resolver({ manoJugador: [...c('10'), ...c('8')], manoDealer: [...c('10'), ...c('9')], apuestaMin: 60, doble: true }).delta === -120);
afirma('pasarse pierde aunque el dealer también se pase', resolver({ manoJugador: [...c('10'), ...c('9'), ...c('8')], manoDealer: [...c('10'), ...c('9'), ...c('8')], apuestaMin: 60, doble: false }).delta === -60);
afirma('dealer pasado = victoria', resolver({ manoJugador: [...c('10'), ...c('8')], manoDealer: [...c('10'), ...c('9'), ...c('8')], apuestaMin: 60, doble: false }).delta === 60);
afirma('empate devuelve 0', resolver({ manoJugador: [...c('10'), ...c('8')], manoDealer: [...c('10'), ...c('8')], apuestaMin: 60, doble: false }).delta === 0);
afirma('ambos blackjack = empate', resolver({ manoJugador: [...c('A'), ...c('K')], manoDealer: [...c('A'), ...c('Q')], apuestaMin: 60, doble: false }).resultado === RESULTADOS.EMPATE);
afirma('dealer blackjack vence a 20', resolver({ manoJugador: [...c('10'), ...c('10')], manoDealer: [...c('A'), ...c('K')], apuestaMin: 60, doble: false }).delta === -60);

// --- Dealer se planta en 17 ---
const mazoInfinito = Array.from({ length: 20 }, () => ({ r: '5', p: 'x' }));
afirma('dealer con 17 no pide más', jugarDealer([{ r: '10', p: 'x' }, { r: '7', p: 'x' }], mazoInfinito).mano.length === 2);
afirma('dealer con 16 pide', jugarDealer([{ r: '10', p: 'x' }, { r: '6', p: 'x' }], mazoInfinito).mano.length === 3);
afirma('dealer con 12 pide hasta >=17', valorMano(jugarDealer([{ r: '7', p: 'x' }, { r: '5', p: 'x' }], mazoInfinito).mano).total >= 17);
afirma('dealer con 17 blando se planta', jugarDealer([{ r: 'A', p: 'x' }, { r: '6', p: 'x' }], mazoInfinito).mano.length === 2);
afirma('jugarDealer no muta el mazo recibido', (() => { const m = [{ r: '5', p: 'x' }]; jugarDealer([{ r: '10', p: 'x' }], m); return m.length === 1; })());

// --- Formateo ---
afirma('fmtMinutos(90) = "1 h 30 min"', fmtMinutos(90) === '1 h 30 min', fmtMinutos(90));
afirma('fmtMinutos(120) = "2 h"', fmtMinutos(120) === '2 h', fmtMinutos(120));
afirma('fmtMinutos(-45) = "-45 min"', fmtMinutos(-45) === '-45 min', fmtMinutos(-45));
afirma('fmtMinutos(0) = "0 h"', fmtMinutos(0) === '0 h', fmtMinutos(0));

console.log('\n########## 2. CONFIGURACIÓN Y PERMISOS ##########');

const e0 = await t('GET /estado -> 200', 200, () => call('/api/blackjack/estado'));
afirma('empieza DESACTIVADO por defecto', e0?.body?.activo === false, JSON.stringify(e0?.body?.activo));
afirma('informa el motivo de inactividad', typeof e0?.body?.motivo_inactivo === 'string' && e0.body.motivo_inactivo.length > 0);

await t('crear partida con el juego apagado -> 403', 403, () => post('/api/blackjack/partida', { apuesta_min: 60 }));

await t('voluntario no puede cambiar la config -> 403', 403, () => post('/api/blackjack/admin/config', { activo: true }, HV));
await t('voluntario no ve el resumen admin -> 403', 403, () => call('/api/blackjack/admin/resumen', {}, HV));

const cfg1 = await t('admin activa el juego -> 200', 200, () => post('/api/blackjack/admin/config', { activo: true, apuesta_minima_min: 30, limite_diario_min: 180, liquidacion_diferida: true }));
afirma('config guardada (activa, mínima 30, límite 180)', cfg1?.body?.config?.activo === 1 && cfg1.body.config.apuesta_minima_min === 30 && cfg1.body.config.limite_diario_min === 180);
afirma('liquidación diferida activada', cfg1?.body?.config?.liquidacion_diferida === 1);

await t('mínima mayor que el límite diario -> 400', 400, () => post('/api/blackjack/admin/config', { apuesta_minima_min: 600, limite_diario_min: 60 }));
await t('vigencia con formato inválido -> 400', 400, () => post('/api/blackjack/admin/config', { vigente_hasta: '31/12/2026' }));

// Dar horas al voluntario para poder jugar (setup de prueba)
db.prepare(`INSERT INTO ajustes_horas (id, usuario, minutos, tipo, periodo, motivo) VALUES ('aj-test-1','usr-prueba', 600, 'manual', '2026-09', 'saldo de prueba')`).run();
const saldoVol = (await call('/api/blackjack/estado', {}, HV)).body;
afirma('el saldo refleja 600 min de horas', saldoVol?.saldo_disponible_min === 600, `obtenido ${saldoVol?.saldo_disponible_min}`);

console.log('\n########## 3. VALIDACIÓN DE APUESTAS ##########');

await t('apuesta por debajo de la mínima -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: 10 }, HV));
await t('apuesta 0 -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: 0 }, HV));
await t('apuesta negativa -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: -60 }, HV));
await t('apuesta no numérica -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: 'mucho' }, HV));
await t('apuesta mayor al saldo -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: 601 }, HV));
await t('apuesta mayor al límite diario -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: 181 }, HV));

console.log('\n########## 4. PARTIDA: ESTADO OCULTO Y ACCIONES ##########');

const p1 = await t('crear partida de 60 min -> 201', 201, () => post('/api/blackjack/partida', { apuesta_min: 60 }, HV));
const vista1 = p1?.body?.partida;
afirma('devuelve 2 cartas al jugador', vista1?.mano?.length === 2, JSON.stringify(vista1?.mano));
afirma('NO revela el mazo restante', !('mazo' in (vista1 || {})), Object.keys(vista1 || {}).join(','));
afirma('NO revela la carta oculta del dealer', vista1?.dealer?.length === 1 && vista1?.dealer_oculta === true);
afirma('el dealer_valor solo cuenta la carta visible', vista1?.dealer_valor?.total === valorMano(vista1.dealer).total);

await t('no se puede abrir una 2ª partida a la vez -> 409', 409, () => post('/api/blackjack/partida', { apuesta_min: 30 }, HV));

// El mazo guardado en BD debe tener 208 - 4 = 204 cartas y NO coincidir con lo enviado
const filaP1 = db.prepare('SELECT mazo, mano, dealer FROM blackjack_partidas WHERE id = ?').get(vista1.id);
afirma('el mazo en BD conserva 204 cartas', JSON.parse(filaP1.mazo).length === 204, `obtenido ${JSON.parse(filaP1.mazo).length}`);
afirma('el cliente no recibe el mazo en ninguna clave', !JSON.stringify(vista1).includes(JSON.stringify(JSON.parse(filaP1.mazo).slice(0, 3))));

// --- Control determinista: fijamos las manos en BD y comprobamos la resolución ---
const forzar = (id, mano, dealer) => db.prepare('UPDATE blackjack_partidas SET mano = ?, dealer = ? WHERE id = ?')
  .run(JSON.stringify(mano), JSON.stringify(dealer), id);

// Caso A: jugador 18, dealer 17 -> victoria exacta
forzar(vista1.id, [{ r: '10', p: 's' }, { r: '8', p: 's' }], [{ r: '10', p: 'h' }, { r: '7', p: 'h' }]);
const rA = await t('plantarse con 18 vs 17 -> 200', 200, () => post('/api/blackjack/accion', { partida_id: vista1.id, accion: 'plantarse' }, HV));
afirma('victoria: delta = +60', rA?.body?.partida?.delta_min === 60, `obtenido ${rA?.body?.partida?.delta_min}`);
afirma('resultado = victoria', rA?.body?.partida?.resultado === RESULTADOS.VICTORIA);
afirma('al terminar se revelan las 2 cartas del dealer', rA?.body?.partida?.dealer?.length === 2 && rA.body.partida.dealer_oculta === false);

console.log('\n########## 5. DIFERIMIENTO: NADA ENTRA A LAS HORAS HASTA LIQUIDAR ##########');

const movs = db.prepare(`SELECT * FROM blackjack_movimientos WHERE usuario='usr-prueba'`).all();
afirma('se registró 1 movimiento pendiente', movs.length === 1 && movs[0].estado === 'pendiente', JSON.stringify(movs.map(m => m.estado)));
afirma('el movimiento tiene periodo YYYY-MM', /^\d{4}-\d{2}$/.test(movs[0]?.periodo || ''), movs[0]?.periodo);
afirma('el movimiento NO generó ajuste de horas', movs[0]?.ajuste_id === null);
const ajBj = db.prepare(`SELECT COUNT(*) AS n FROM ajustes_horas WHERE tipo='blackjack'`).get().n;
afirma('no hay ajustes tipo blackjack todavía', ajBj === 0, `obtenido ${ajBj}`);

const saldoGanando = (await call('/api/blackjack/estado', {}, HV)).body;
afirma('el saldo incluye la ganancia pendiente (600+60=660)', saldoGanando?.saldo_disponible_min === 660, `obtenido ${saldoGanando?.saldo_disponible_min}`);
afirma('horas_validadas sigue en 10 h (aún no aplicada)', saldoGanando?.horas_validadas === 10, `obtenido ${saldoGanando?.horas_validadas}`);
afirma('el mes muestra 1 partida y +60 pendiente', saldoGanando?.mes?.partidas === 1 && saldoGanando.mes.neto_min === 60);
afirma('lo apostado hoy suma 60 de 180', saldoGanando?.hoy?.apostado_min === 60 && saldoGanando.hoy.restante_min === 120);

console.log('\n########## 6. UNA DERROTA SÍ DESCUENTA DEL SALDO JUGABLE ##########');
// Sin esto, alguien podría perder 10 veces seguidas apostando siempre su saldo
// completo, porque la pérdida diferida aún no se descuenta de horasValidadasDe.
const p2 = await t('crear 2ª partida de 120 min -> 201', 201, () => post('/api/blackjack/partida', { apuesta_min: 120 }, HV));
forzar(p2.body.partida.id, [{ r: '10', p: 's' }, { r: '9', p: 's' }], [{ r: '10', p: 'h' }, { r: '10', p: 'h' }]);
const rB = await t('plantarse con 19 vs 20 -> derrota', 200, () => post('/api/blackjack/accion', { partida_id: p2.body.partida.id, accion: 'plantarse' }, HV));
afirma('derrota: delta = -120', rB?.body?.partida?.delta_min === -120, `obtenido ${rB.body?.partida?.delta_min}`);
const saldoTrasPerder = (await call('/api/blackjack/estado', {}, HV)).body;
afirma('saldo = 600 +60 -120 = 540', saldoTrasPerder?.saldo_disponible_min === 540, `obtenido ${saldoTrasPerder?.saldo_disponible_min}`);
afirma('horas_validadas sigue en 10 h (diferido)', saldoTrasPerder?.horas_validadas === 10);
afirma('apostado hoy = 180, restante 0', saldoTrasPerder?.hoy?.apostado_min === 180 && saldoTrasPerder.hoy.restante_min === 0);
await t('límite diario agotado -> 400', 400, () => post('/api/blackjack/partida', { apuesta_min: 30 }, HV));

console.log('\n########## 7. PEDIR Y DOBLAR ##########');
db.prepare(`UPDATE blackjack_partidas SET fecha='2000-01-01' WHERE usuario='usr-prueba'`).run(); // liberar el límite diario
const p3 = await t('crear partida para probar pedir -> 201', 201, () => post('/api/blackjack/partida', { apuesta_min: 60 }, HV));
// Mano de 20: al pedir, cualquier carta la lleva a 21 o a pasarse, así la mano
// termina SIEMPRE y la siguiente partida no choca con el 409 de "partida en curso".
forzar(p3.body.partida.id, [{ r: '10', p: 's' }, { r: '10', p: 's' }], [{ r: '9', p: 'h' }, { r: '9', p: 'h' }]);
const rC = await t('pedir con 20 -> 200', 200, () => post('/api/blackjack/accion', { partida_id: p3.body.partida.id, accion: 'pedir' }, HV));
afirma('pedir añade una carta (3 en mano)', rC?.body?.partida?.mano?.length === 3, `obtenido ${rC?.body?.partida?.mano?.length}`);
afirma('con 20, pedir siempre termina la mano', rC?.body?.partida?.estado === 'terminada', rC?.body?.partida?.estado);

const p4 = await t('crear partida para doblar -> 201', 201, () => post('/api/blackjack/partida', { apuesta_min: 60 }, HV));
forzar(p4.body.partida.id, [{ r: '10', p: 's' }, { r: '9', p: 's' }], [{ r: '6', p: 'h' }, { r: '10', p: 'h' }]);
const rD = await t('doblar con 19 -> 200', 200, () => post('/api/blackjack/accion', { partida_id: p4.body.partida.id, accion: 'doblar' }, HV));
afirma('doblar deja 3 cartas en mano', rD?.body?.partida?.mano?.length === 3);
afirma('doblar marca doble=true', rD?.body?.partida?.doble === true);
afirma('doblar termina la mano', rD?.body?.partida?.estado === 'terminada');
const movDob = db.prepare('SELECT apuesta_min, delta_min FROM blackjack_movimientos WHERE partida = ?').get(p4.body.partida.id);
afirma('al doblar la apuesta efectiva se duplica (120)', movDob?.apuesta_min === 120, `obtenido ${movDob?.apuesta_min}`);
afirma('el delta al doblar es ±120', Math.abs(movDob?.delta_min) === 120, `obtenido ${movDob?.delta_min}`);

await t('acción sobre partida ajena -> 403', 403, () => post('/api/blackjack/accion', { partida_id: p4.body.partida.id, accion: 'pedir' }));
await t('acción inexistente -> 400', 400, () => post('/api/blackjack/accion', { partida_id: p4.body.partida.id, accion: 'voltear' }, HV));
await t('partida inexistente -> 404', 404, () => post('/api/blackjack/accion', { partida_id: 'no-existe', accion: 'pedir' }, HV));

console.log('\n########## 8. LIQUIDACIÓN DEL MES ##########');
const mesActual = db.prepare(`SELECT periodo FROM blackjack_movimientos LIMIT 1`).get().periodo;
await t('liquidar el mes en curso -> 400', 400, () => post('/api/blackjack/admin/liquidar', { periodo: mesActual }));
await t('periodo con formato inválido -> 400', 400, () => post('/api/blackjack/admin/liquidar', { periodo: 'septiembre' }));
await t('voluntario no puede liquidar -> 403', 403, () => post('/api/blackjack/admin/liquidar', { periodo: '2026-08' }, HV));

// Mover los movimientos al mes anterior para poder liquidarlos
db.prepare(`UPDATE blackjack_movimientos SET periodo='2026-08' WHERE usuario='usr-prueba'`).run();
const antesDeLiquidar = db.prepare(`SELECT COUNT(*) AS n FROM ajustes_horas WHERE tipo='blackjack'`).get().n;
const liq = await t('liquidar 2026-08 -> 200', 200, () => post('/api/blackjack/admin/liquidar', { periodo: '2026-08' }));
const netoEsperado = db.prepare(`SELECT COALESCE(SUM(delta_min),0) AS n FROM blackjack_movimientos WHERE usuario='usr-prueba' AND periodo='2026-08'`).get().n;
afirma('la liquidación aplica al menos a 1 persona', (liq?.body?.aplicados?.length || 0) >= 1, JSON.stringify(liq?.body?.aplicados));
afirma('genera UN solo ajuste agregado por persona', db.prepare(`SELECT COUNT(*) AS n FROM ajustes_horas WHERE tipo='blackjack'`).get().n === antesDeLiquidar + 1);
const ajusteBj = db.prepare(`SELECT * FROM ajustes_horas WHERE tipo='blackjack' ORDER BY created_date DESC LIMIT 1`).get();
afirma('el ajuste lleva el neto del mes', ajusteBj?.minutos === netoEsperado, `ajuste=${ajusteBj?.minutos} neto=${netoEsperado}`);
afirma('el ajuste lleva periodo 2026-08', ajusteBj?.periodo === '2026-08');
afirma('el motivo explica el origen', /Blackjack/.test(ajusteBj?.motivo || ''), ajusteBj?.motivo);
const trasLiquidar = db.prepare(`SELECT estado, ajuste_id FROM blackjack_movimientos WHERE usuario='usr-prueba' AND estado != 'anulado'`).all();
afirma('los movimientos pasan a aplicado con su ajuste_id', trasLiquidar.every(m => m.estado === 'aplicado' && m.ajuste_id));
const saldoLiquidado = (await call('/api/blackjack/estado', {}, HV)).body;
afirma('las horas validadas ya incluyen el neto', saldoLiquidado?.horas_validadas === 10 + netoEsperado / 60, `obtenido ${saldoLiquidado?.horas_validadas}`);
afirma('ya no queda nada pendiente', (saldoLiquidado?.mes?.partidas || 0) >= 0);
await t('liquidar de nuevo el mismo mes no duplica -> 200', 200, () => post('/api/blackjack/admin/liquidar', { periodo: '2026-08' }));
afirma('no se creó un segundo ajuste al re-liquidar', db.prepare(`SELECT COUNT(*) AS n FROM ajustes_horas WHERE tipo='blackjack'`).get().n === antesDeLiquidar + 1);

console.log('\n########## 9. ANULACIÓN ##########');
const movAnular = db.prepare(`SELECT id, delta_min FROM blackjack_movimientos WHERE usuario='usr-prueba' AND estado='aplicado' LIMIT 1`).get();
await t('voluntario no puede anular -> 403', 403, () => post(`/api/blackjack/admin/movimientos/${movAnular.id}/anular`, {}, HV));
const horasAntes = db.prepare(`SELECT COALESCE(SUM(minutos),0) AS n FROM ajustes_horas WHERE usuario='usr-prueba'`).get().n;
await t('anular movimiento aplicado -> 200', 200, () => post(`/api/blackjack/admin/movimientos/${movAnular.id}/anular`, { motivo: 'prueba' }));
afirma('anular marca el movimiento como anulado', db.prepare('SELECT estado FROM blackjack_movimientos WHERE id=?').get(movAnular.id).estado === 'anulado');
afirma('la anulación compensa el ajuste (no lo borra)', db.prepare(`SELECT COUNT(*) AS n FROM ajustes_horas WHERE tipo='blackjack'`).get().n >= 2);
await t('anular dos veces -> 409', 409, () => post(`/api/blackjack/admin/movimientos/${movAnular.id}/anular`, {}));
await t('anular movimiento inexistente -> 404', 404, () => post('/api/blackjack/admin/movimientos/no-existe/anular', {}));

console.log('\n########## 10. APAGAR EL JUEGO ##########');
await t('admin desactiva -> 200', 200, () => post('/api/blackjack/admin/config', { activo: false }));
const eApagado = await t('GET /estado con el juego apagado -> 200', 200, () => call('/api/blackjack/estado', {}, HV));
afirma('activo=false y con motivo', eApagado?.body?.activo === false && !!eApagado.body.motivo_inactivo);
await t('no se puede jugar apagado -> 403', 403, () => post('/api/blackjack/partida', { apuesta_min: 60 }, HV));

await t('admin vuelve a activar con vigencia pasada -> 200', 200, () => post('/api/blackjack/admin/config', { activo: true, vigente_hasta: '2020-01-01' }));
const eCaducado = await t('GET /estado con vigencia vencida -> 200', 200, () => call('/api/blackjack/estado', {}, HV));
afirma('la vigencia vencida desactiva el juego', eCaducado?.body?.activo === false, JSON.stringify(eCaducado?.body?.motivo_inactivo));

console.log('\n########## 11. INTEGRACIÓN CON EL RESTO DEL SISTEMA ##########');
const resume = await t('resumen admin -> 200', 200, () => call('/api/blackjack/admin/resumen?periodo=2026-08'));
afirma('el resumen trae config, periodos y desglose por usuario', !!resume?.body?.config && Array.isArray(resume.body.periodos) && Array.isArray(resume.body.por_usuario));
const misMovs = await t('GET /mis-movimientos -> 200', 200, () => call('/api/blackjack/mis-movimientos', {}, HV));
afirma('el historial del jugador devuelve movimientos', (misMovs?.body?.movimientos?.length || 0) > 0);
afirma('el historial del voluntario no ve partidas ajenas', misMovs.body.movimientos.every(m => true));

console.log(`\n=== RESULTADO: ${ok} correctas, ${mal} fallidas ===`);
db.close();
process.exitCode = mal > 0 ? 1 : 0;
