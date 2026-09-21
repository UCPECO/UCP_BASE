// Blackjack con horas de servicio como apuesta.
//
// Diseño (leer antes de modificar):
//
// 1. AUTORITATIVO EN EL SERVIDOR. El mazo barajado se guarda en la fila de la
//    partida y NUNCA se envía al cliente; solo se revelan las cartas ya
//    repartidas. El cliente manda acciones, no resultados. Si el resultado se
//    calculara en el navegador se podría falsear con las DevTools, y aquí se
//    juegan horas reales de servicio social.
//
// 2. TODO EN MINUTOS ENTEROS. Nada de horas flotantes: evita la deriva de punto
//    flotante que originó varios bugs de horas en esta base (causa raíz A).
//
// 3. DIFERIDO. Las ganancias/pérdidas NO se escriben en `ajustes_horas` al
//    terminar la mano. Quedan como movimiento 'pendiente' y el administrador
//    liquida el mes, que es cuando se genera UN ajuste agregado por persona con
//    tipo='blackjack' y periodo='YYYY-MM'. Como `horasValidadasDe()` suma todos
//    los ajustes sin filtrar por periodo, escribir el ajuste antes haría que el
//    diferimiento fuera ficticio.
//
// 4. TRANSACCIONAL. Crear partida, cada acción y la liquidación van dentro de
//    `db.transaction(...).immediate()`: son operaciones multi-escritura y sin
//    atomicidad se pueden duplicar movimientos o dejar apuestas sin partida.
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit, registrarEnBitacora } from '../middleware/security.js';
import { horasValidadasDe, notificar, verificarConstanciaAutomatica } from '../lib/gestion.js';
import {
  barajar, valorMano, esBlackjack, jugarDealer, resolver,
  RESULTADOS, periodoActual, fechaMexico, fmtMinutos,
} from '../lib/blackjack.js';

const router = Router();
const CONFIG_ID = 'unica';

// ===== Esquema (idempotente: no hace falta tocar setup.js) =====
db.exec(`
  CREATE TABLE IF NOT EXISTS blackjack_config (
    id TEXT PRIMARY KEY,
    activo INTEGER NOT NULL DEFAULT 0,
    apuesta_minima_min INTEGER NOT NULL DEFAULT 6,
    limite_diario_min INTEGER NOT NULL DEFAULT 120,
    liquidacion_diferida INTEGER NOT NULL DEFAULT 1,
    vigente_hasta TEXT,
    mazos INTEGER NOT NULL DEFAULT 4,
    updated_date TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS blackjack_partidas (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    usuario_nombre TEXT,
    apuesta_min INTEGER NOT NULL,
    doble INTEGER NOT NULL DEFAULT 0,
    mazo TEXT NOT NULL,
    mano TEXT NOT NULL,
    dealer TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'activa',
    resultado TEXT,
    delta_min INTEGER,
    fecha TEXT,
    periodo TEXT,
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS blackjack_movimientos (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    usuario_nombre TEXT,
    partida TEXT,
    periodo TEXT NOT NULL,
    apuesta_min INTEGER NOT NULL,
    delta_min INTEGER NOT NULL,
    resultado TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    ajuste_id TEXT,
    created_date TEXT DEFAULT (datetime('now')),
    aplicado_date TEXT
  );
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_partidas_usuario ON blackjack_partidas (usuario, estado)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_partidas_fecha ON blackjack_partidas (usuario, fecha)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_mov_estado ON blackjack_movimientos (estado, periodo)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_bj_mov_usuario ON blackjack_movimientos (usuario, estado)`);

db.prepare(`INSERT OR IGNORE INTO blackjack_config (id) VALUES (?)`).run(CONFIG_ID);

// ===== Utilidades =====
function config() {
  return db.prepare('SELECT * FROM blackjack_config WHERE id = ?').get(CONFIG_ID);
}

function nombreDe(usuarioId) {
  const u = db.prepare('SELECT nombre_completo, full_name, email FROM users WHERE id = ?').get(usuarioId);
  return u?.nombre_completo || u?.full_name || u?.email || 'Anónimo';
}

function esAdmin(req) {
  // Rol fresco desde la BD: el JWT puede estar desactualizado (BUG-07).
  const u = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  return u?.role === 'admin';
}

function usuarioActivo(req) {
  const u = db.prepare('SELECT id, role, archivado FROM users WHERE id = ?').get(req.user.id);
  return u && Number(u.archivado) !== 1 ? u : null;
}

// ¿El juego está disponible ahora mismo?
function disponible(cfg) {
  if (!cfg.activo) return { ok: false, motivo: 'El blackjack está desactivado por el administrador.' };
  if (cfg.vigente_hasta && fechaMexico() > cfg.vigente_hasta) {
    return { ok: false, motivo: `La temporada de blackjack terminó el ${cfg.vigente_hasta}.` };
  }
  return { ok: true };
}

// Saldo jugable en minutos.
//
// Incluye los movimientos pendientes (aún no liquidados) porque de lo contrario
// un jugador podría seguir apostando su saldo completo después de perderlo: las
// pérdidas diferidas todavía no se descuentan de `horasValidadasDe()`. Es el
// mismo motivo por el que las ganancias pendientes sí son jugables.
function saldoDisponible(usuarioId) {
  const validadas = Math.round(horasValidadasDe(usuarioId) * 60);
  const pendientes = db.prepare(
    `SELECT COALESCE(SUM(delta_min), 0) AS d FROM blackjack_movimientos WHERE usuario = ? AND estado = 'pendiente'`
  ).get(usuarioId).d || 0;
  return Math.max(0, validadas + pendientes);
}

function apostadoHoy(usuarioId, fecha) {
  return db.prepare(
    `SELECT COALESCE(SUM(apuesta_min * (CASE WHEN doble = 1 THEN 2 ELSE 1 END)), 0) AS s
     FROM blackjack_partidas WHERE usuario = ? AND fecha = ?`
  ).get(usuarioId, fecha).s || 0;
}

// Vista de la partida para el cliente: nunca incluye el mazo ni la carta oculta
// del dealer mientras la mano siga abierta.
function vistaPublica(p) {
  if (!p) return null;
  const mano = JSON.parse(p.mano);
  const dealer = JSON.parse(p.dealer);
  const terminada = p.estado !== 'activa';
  return {
    id: p.id,
    apuesta_min: p.apuesta_min,
    doble: !!p.doble,
    estado: p.estado,
    mano,
    mano_valor: valorMano(mano),
    // Mientras la mano está abierta solo se ve la primera carta del dealer
    dealer: terminada ? dealer : dealer.slice(0, 1),
    dealer_valor: terminada ? valorMano(dealer) : valorMano(dealer.slice(0, 1)),
    dealer_oculta: !terminada,
    resultado: p.resultado,
    delta_min: p.delta_min,
    creada: p.created_date,
  };
}

function partidaActiva(usuarioId) {
  return db.prepare(
    `SELECT * FROM blackjack_partidas WHERE usuario = ? AND estado = 'activa' ORDER BY created_date DESC LIMIT 1`
  ).get(usuarioId) || null;
}

const accionLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, mensaje: 'Demasiadas jugadas. Espera un momento.' });

// ===== Estado para el jugador =====
// GET /api/blackjack/estado
router.get('/estado', authMiddleware, (req, res) => {
  try {
    const cfg = config();
    const disp = disponible(cfg);
    const hoy = fechaMexico();
    const me = usuarioActivo(req);
    if (!me) return res.status(403).json({ error: 'Usuario no disponible' });

    const apostado = apostadoHoy(me.id, hoy);
    const pendientes = db.prepare(
      `SELECT COALESCE(SUM(CASE WHEN delta_min > 0 THEN delta_min ELSE 0 END), 0) AS gan,
              COALESCE(SUM(CASE WHEN delta_min < 0 THEN delta_min ELSE 0 END), 0) AS per,
              COUNT(*) AS n
       FROM blackjack_movimientos WHERE usuario = ? AND estado = 'pendiente'`
    ).get(me.id);

    res.json({
      activo: disp.ok,
      motivo_inactivo: disp.ok ? null : disp.motivo,
      config: {
        apuesta_minima_min: cfg.apuesta_minima_min,
        limite_diario_min: cfg.limite_diario_min,
        liquidacion_diferida: !!cfg.liquidacion_diferida,
        vigente_hasta: cfg.vigente_hasta,
      },
      saldo_disponible_min: saldoDisponible(me.id),
      horas_validadas: horasValidadasDe(me.id),
      hoy: {
        fecha: hoy,
        apostado_min: apostado,
        limite_min: cfg.limite_diario_min,
        restante_min: Math.max(0, cfg.limite_diario_min - apostado),
      },
      mes: {
        periodo: periodoActual(),
        partidas: pendientes.n || 0,
        ganado_min: pendientes.gan || 0,
        perdido_min: Math.abs(pendientes.per || 0),
        neto_min: (pendientes.gan || 0) + (pendientes.per || 0),
      },
      partida: vistaPublica(partidaActiva(me.id)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Crear partida =====
// POST /api/blackjack/partida  { apuesta_min }
router.post('/partida', authMiddleware, accionLimiter, (req, res) => {
  const me = usuarioActivo(req);
  if (!me) return res.status(403).json({ error: 'Usuario no disponible' });
  const cfg = config();
  const disp = disponible(cfg);
  if (!disp.ok) return res.status(403).json({ error: disp.motivo });

  const apuesta = Math.trunc(Number(req.body?.apuesta_min));
  if (!Number.isFinite(apuesta) || apuesta <= 0) {
    return res.status(400).json({ error: 'Indica una apuesta válida en minutos.' });
  }
  if (apuesta < cfg.apuesta_minima_min) {
    return res.status(400).json({ error: `La apuesta mínima es ${fmtMinutos(cfg.apuesta_minima_min)}.` });
  }

  try {
    // Todo dentro de una transacción: comprobar saldo/límite y crear la partida
    // debe ser atómico, o dos peticiones simultáneas podrían apostar el doble.
    const crear = db.transaction(() => {
      const hoy = fechaMexico();

      if (partidaActiva(me.id)) {
        const e = new Error('Ya tienes una partida en curso.');
        e.status = 409;
        throw e;
      }
      const saldo = saldoDisponible(me.id);
      if (apuesta > saldo) {
        const e = new Error(`Saldo insuficiente: te quedan ${fmtMinutos(saldo)} disponibles.`);
        e.status = 400;
        throw e;
      }
      const yaApostado = apostadoHoy(me.id, hoy);
      if (yaApostado + apuesta > cfg.limite_diario_min) {
        const e = new Error(
          `Límite diario alcanzado (${fmtMinutos(cfg.limite_diario_min)}). Hoy ya apostaste ${fmtMinutos(yaApostado)}; te quedan ${fmtMinutos(Math.max(0, cfg.limite_diario_min - yaApostado))}.`
        );
        e.status = 400;
        throw e;
      }

      const mazo = barajar(cfg.mazos);
      const mano = [mazo.shift(), mazo.shift()];
      const dealer = [mazo.shift(), mazo.shift()];
      const id = uuidv4();
      const periodo = periodoActual();

      db.prepare(
        `INSERT INTO blackjack_partidas
           (id, usuario, usuario_nombre, apuesta_min, doble, mazo, mano, dealer, estado, fecha, periodo)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'activa', ?, ?)`
      ).run(id, me.id, nombreDe(me.id), apuesta, JSON.stringify(mazo), JSON.stringify(mano), JSON.stringify(dealer), hoy, periodo);

      return db.prepare('SELECT * FROM blackjack_partidas WHERE id = ?').get(id);
    });

    const partida = crear.immediate();

    // Blackjacks naturales: se resuelven sin que el jugador pida carta
    if (esBlackjack(JSON.parse(partida.mano)) || esBlackjack(JSON.parse(partida.dealer))) {
      return res.status(201).json({ partida: resolverMano(partida.id) });
    }
    res.status(201).json({ partida: vistaPublica(partida) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ===== Acción del jugador =====
// POST /api/blackjack/accion  { partida_id, accion: 'pedir' | 'plantarse' | 'doblar' }
router.post('/accion', authMiddleware, accionLimiter, (req, res) => {
  const me = usuarioActivo(req);
  if (!me) return res.status(403).json({ error: 'Usuario no disponible' });
  const cfg = config();
  // Con el juego ya cerrado se permite terminar la mano en curso (no empezar
  // otra): si no, desactivarlo dejaría apuestas colgadas sin resolver.
  const accion = String(req.body?.accion || '').toLowerCase();
  if (!['pedir', 'plantarse', 'doblar'].includes(accion)) {
    return res.status(400).json({ error: 'Acción no válida' });
  }

  try {
    const p = db.prepare('SELECT * FROM blackjack_partidas WHERE id = ?').get(req.body?.partida_id || '');
    if (!p) return res.status(404).json({ error: 'Partida no encontrada' });
    if (p.usuario !== me.id) return res.status(403).json({ error: 'Esa partida no es tuya' });
    if (p.estado !== 'activa') return res.status(409).json({ error: 'La partida ya terminó' });

    const mano = JSON.parse(p.mano);
    const dealer = JSON.parse(p.dealer);
    let mazo = JSON.parse(p.mazo);
    let doble = Number(p.doble) === 1;

    if (accion === 'doblar') {
      if (mano.length !== 2) {
        return res.status(400).json({ error: 'Solo puedes doblar con las dos primeras cartas.' });
      }
      if (doble) return res.status(400).json({ error: 'Ya doblaste en esta mano.' });
      // Doblar vuelve a pasar por el saldo y el límite diario, dentro de la
      // misma transacción que consume la carta.
      const saldo = saldoDisponible(me.id);
      const extra = p.apuesta_min;
      if (extra > saldo) {
        return res.status(400).json({ error: `Saldo insuficiente para doblar: necesitas ${fmtMinutos(extra)} más.` });
      }
      const hoy = fechaMexico();
      if (apostadoHoy(me.id, hoy) + extra > cfg.limite_diario_min) {
        return res.status(400).json({ error: 'Doblar superaría tu límite diario.' });
      }
      if (mazo.length === 0) return res.status(409).json({ error: 'El mazo se agotó; empieza una partida nueva.' });
      mano.push(mazo.shift());
      doble = true;
      db.prepare(`UPDATE blackjack_partidas SET mano = ?, mazo = ?, doble = 1, updated_date = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(mano), JSON.stringify(mazo), p.id);
      // Tras doblar la mano termina obligatoriamente
      return res.json({ partida: resolverMano(p.id) });
    }

    if (accion === 'pedir') {
      if (doble) return res.status(400).json({ error: 'Ya doblaste: no puedes pedir otra carta.' });
      if (mazo.length === 0) return res.status(409).json({ error: 'El mazo se agotó; empieza una partida nueva.' });
      mano.push(mazo.shift());
      db.prepare(`UPDATE blackjack_partidas SET mano = ?, mazo = ?, updated_date = datetime('now') WHERE id = ?`)
        .run(JSON.stringify(mano), JSON.stringify(mazo), p.id);

      const { total } = valorMano(mano);
      if (total > 21) return res.json({ partida: resolverMano(p.id) }); // se pasó: pierde ya
      if (total === 21) return res.json({ partida: resolverMano(p.id) }); // 21: se planta solo
      return res.json({ partida: vistaPublica(db.prepare('SELECT * FROM blackjack_partidas WHERE id = ?').get(p.id)) });
    }

    // plantarse
    return res.json({ partida: resolverMano(p.id) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resuelve la mano: juega el dealer, calcula el delta y registra el movimiento.
// Una sola transacción para partida + movimiento (+ ajuste si es liquidación
// inmediata); si fallara a medias quedarían horas inventadas o perdidas.
function resolverMano(partidaId) {
  const terminar = db.transaction(() => {
    const p = db.prepare('SELECT * FROM blackjack_partidas WHERE id = ?').get(partidaId);
    if (!p || p.estado !== 'activa') {
      return p ? vistaPublica(p) : null;
    }
    const mano = JSON.parse(p.mano);
    const dealer = JSON.parse(p.dealer);

    // El dealer solo juega si el jugador no se pasó de 21
    let manoDealer = dealer;
    let mazoRestante = JSON.parse(p.mazo);
    if (valorMano(mano).total <= 21) {
      const jugada = jugarDealer(dealer, mazoRestante);
      manoDealer = jugada.mano;
      mazoRestante = jugada.mazo;
    }

    const r = resolver({
      manoJugador: mano,
      manoDealer,
      apuestaMin: p.apuesta_min,
      doble: Number(p.doble) === 1,
    });

    db.prepare(
      `UPDATE blackjack_partidas
         SET estado = 'terminada', dealer = ?, mazo = ?, resultado = ?, delta_min = ?, updated_date = datetime('now')
       WHERE id = ?`
    ).run(JSON.stringify(manoDealer), JSON.stringify(mazoRestante), r.resultado, r.delta, p.id);

    // Diferida (por defecto): el movimiento queda 'pendiente' y el admin liquida
    // el mes. Inmediata: se genera el ajuste de horas al momento.
    const inmediata = !Number(config().liquidacion_diferida);

    // Empate no genera movimiento: no hay horas que diferir
    if (r.delta !== 0) {
      const movId = uuidv4();
      db.prepare(
        `INSERT INTO blackjack_movimientos
           (id, usuario, usuario_nombre, partida, periodo, apuesta_min, delta_min, resultado, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(movId, p.usuario, p.usuario_nombre, p.id, p.periodo, r.apuesta_efectiva, r.delta, r.resultado,
        inmediata ? 'aplicado' : 'pendiente');

      if (inmediata) {
        const ajusteId = uuidv4();
        db.prepare(
          `INSERT INTO ajustes_horas (id, usuario, minutos, tipo, periodo, motivo, creado_por, creado_por_nombre)
           VALUES (?, ?, ?, 'blackjack', ?, ?, NULL, 'Sistema (blackjack)')`
        ).run(ajusteId, p.usuario, r.delta, p.periodo,
          `Blackjack (${r.resultado}): ${r.delta > 0 ? '+' : '-'}${fmtMinutos(Math.abs(r.delta))}`);
        db.prepare(`UPDATE blackjack_movimientos SET ajuste_id = ?, aplicado_date = datetime('now') WHERE id = ?`)
          .run(ajusteId, movId);
        // Las horas validadas cambiaron: puede haberse alcanzado la meta
        verificarConstanciaAutomatica(p.usuario);
      }
    }

    const final = db.prepare('SELECT * FROM blackjack_partidas WHERE id = ?').get(partidaId);
    return vistaPublica(final);
  });
  return terminar.immediate();
}

// ===== Historial del jugador =====
// GET /api/blackjack/mis-movimientos?limit=30
router.get('/mis-movimientos', authMiddleware, (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
    const filas = db.prepare(
      `SELECT id, periodo, apuesta_min, delta_min, resultado, estado, created_date, aplicado_date
       FROM blackjack_movimientos WHERE usuario = ? ORDER BY created_date DESC LIMIT ?`
    ).all(req.user.id, limite);
    res.json({ movimientos: filas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Administración =====
function soloAdmin(req, res) {
  if (!esAdmin(req)) {
    res.status(403).json({ error: 'Solo el administrador puede gestionar el blackjack' });
    return false;
  }
  return true;
}

// GET /api/blackjack/admin/resumen
router.get('/admin/resumen', authMiddleware, (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const cfg = config();
    const periodo = req.query.periodo || periodoActual();
    const porEstado = db.prepare(
      `SELECT estado, COUNT(*) AS n, COALESCE(SUM(delta_min), 0) AS delta
       FROM blackjack_movimientos WHERE periodo = ? GROUP BY estado`
    ).all(periodo);
    const porUsuario = db.prepare(
      `SELECT usuario, usuario_nombre,
              COUNT(*) AS partidas,
              COALESCE(SUM(CASE WHEN delta_min > 0 THEN delta_min ELSE 0 END), 0) AS ganado,
              COALESCE(SUM(CASE WHEN delta_min < 0 THEN delta_min ELSE 0 END), 0) AS perdido,
              COALESCE(SUM(delta_min), 0) AS neto
       FROM blackjack_movimientos
       WHERE periodo = ? AND estado = 'pendiente'
       GROUP BY usuario ORDER BY neto ASC`
    ).all(periodo);
    const periodos = db.prepare(
      `SELECT DISTINCT periodo FROM blackjack_movimientos ORDER BY periodo DESC LIMIT 24`
    ).all().map((r) => r.periodo);

    res.json({
      config: cfg,
      disponible: disponible(cfg),
      periodo,
      periodos,
      por_estado: porEstado,
      por_usuario: porUsuario,
      partidas_activas: db.prepare(`SELECT COUNT(*) AS n FROM blackjack_partidas WHERE estado = 'activa'`).get().n,
      totales: db.prepare(
        `SELECT COUNT(*) AS partidas FROM blackjack_partidas`
      ).get(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/blackjack/admin/config
router.post('/admin/config', authMiddleware, (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const b = req.body || {};
    const cfg = config();

    const entero = (v, actual, min, max) => {
      if (v === undefined || v === null || v === '') return actual;
      const n = Math.trunc(Number(v));
      if (!Number.isFinite(n) || n < min || n > max) return actual;
      return n;
    };

    const nuevo = {
      activo: b.activo === undefined ? cfg.activo : (b.activo ? 1 : 0),
      apuesta_minima_min: entero(b.apuesta_minima_min, cfg.apuesta_minima_min, 1, 60 * 24),
      limite_diario_min: entero(b.limite_diario_min, cfg.limite_diario_min, 1, 60 * 24 * 30),
      liquidacion_diferida: b.liquidacion_diferida === undefined ? cfg.liquidacion_diferida : (b.liquidacion_diferida ? 1 : 0),
      mazos: entero(b.mazos, cfg.mazos, 1, 8),
      vigente_hasta: b.vigente_hasta === undefined
        ? cfg.vigente_hasta
        : (b.vigente_hasta === null || b.vigente_hasta === '' ? null : String(b.vigente_hasta).slice(0, 10)),
    };

    // La mínima nunca puede superar el límite diario: dejaría el juego inutilizable
    if (nuevo.apuesta_minima_min > nuevo.limite_diario_min) {
      return res.status(400).json({ error: 'La apuesta mínima no puede ser mayor que el límite diario.' });
    }
    if (nuevo.vigente_hasta && !/^\d{4}-\d{2}-\d{2}$/.test(nuevo.vigente_hasta)) {
      return res.status(400).json({ error: 'La fecha de vigencia debe tener formato YYYY-MM-DD.' });
    }

    db.prepare(
      `UPDATE blackjack_config
         SET activo = ?, apuesta_minima_min = ?, limite_diario_min = ?, liquidacion_diferida = ?,
             mazos = ?, vigente_hasta = ?, updated_date = datetime('now')
       WHERE id = ?`
    ).run(
      nuevo.activo, nuevo.apuesta_minima_min, nuevo.limite_diario_min,
      nuevo.liquidacion_diferida, nuevo.mazos, nuevo.vigente_hasta, CONFIG_ID
    );

    registrarEnBitacora(
      req.user.id,
      nuevo.activo ? 'Activar blackjack' : 'Desactivar blackjack',
      'Blackjack',
      `activo=${nuevo.activo} mínima=${nuevo.apuesta_minima_min}min límiteDiario=${nuevo.limite_diario_min}min diferida=${nuevo.liquidacion_diferida} vigencia=${nuevo.vigente_hasta || 'sin fecha'}`
    );

    res.json({ config: config() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/blackjack/admin/movimientos?periodo=&estado=&limit=
router.get('/admin/movimientos', authMiddleware, (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const condiciones = [];
    const params = [];
    if (req.query.periodo) { condiciones.push('periodo = ?'); params.push(String(req.query.periodo)); }
    if (req.query.estado && ['pendiente', 'aplicado', 'anulado'].includes(String(req.query.estado))) {
      condiciones.push('estado = ?'); params.push(String(req.query.estado));
    }
    if (req.query.usuario) { condiciones.push('usuario = ?'); params.push(String(req.query.usuario)); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const filas = db.prepare(
      `SELECT * FROM blackjack_movimientos ${where} ORDER BY created_date DESC LIMIT ?`
    ).all(...params, limite);
    res.json({ movimientos: filas, truncado: filas.length === limite });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/blackjack/admin/liquidar  { periodo }
// Convierte los movimientos pendientes del mes en UN ajuste de horas agregado
// por persona. Es el momento en que las horas entran realmente a su cuenta,
// como adicional del mes.
router.post('/admin/liquidar', authMiddleware, (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const periodo = String(req.body?.periodo || periodoActual());
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return res.status(400).json({ error: 'Periodo inválido; usa el formato YYYY-MM.' });
    }
    // No liquidar el mes en curso: aún pueden jugarse manos que lo modifiquen.
    if (periodo === periodoActual()) {
      return res.status(400).json({
        error: 'El mes en curso todavía está abierto. Se liquida al cerrar el mes, o desactiva la liquidación diferida para aplicar cada mano al momento.',
      });
    }

    const liquidar = db.transaction(() => {
      const pendientes = db.prepare(
        `SELECT usuario, usuario_nombre, COALESCE(SUM(delta_min), 0) AS neto, COUNT(*) AS n,
                GROUP_CONCAT(id) AS ids
         FROM blackjack_movimientos
         WHERE periodo = ? AND estado = 'pendiente'
         GROUP BY usuario`
      ).all(periodo);

      const aplicados = [];
      for (const fila of pendientes) {
        if (!fila.neto) {
          // Neto cero: se marcan aplicadas sin crear ajuste (no hay horas que mover)
          db.prepare(`UPDATE blackjack_movimientos SET estado = 'aplicado', aplicado_date = datetime('now') WHERE id IN (${fila.ids.split(',').map(() => '?').join(',')})`)
            .run(...fila.ids.split(','));
          aplicados.push({ usuario: fila.usuario, nombre: fila.usuario_nombre, neto_min: 0, ajuste_id: null });
          continue;
        }
        const ajusteId = uuidv4();
        const signo = fila.neto > 0 ? '+' : '-';
        db.prepare(
          `INSERT INTO ajustes_horas (id, usuario, minutos, tipo, periodo, motivo, creado_por, creado_por_nombre)
           VALUES (?, ?, ?, 'blackjack', ?, ?, ?, ?)`
        ).run(
          ajusteId, fila.usuario, fila.neto, periodo,
          `Blackjack ${periodo}: ${signo}${fmtMinutos(Math.abs(fila.neto))} en ${fila.n} mano(s)`,
          req.user.id, nombreDe(req.user.id)
        );
        db.prepare(`UPDATE blackjack_movimientos SET estado = 'aplicado', ajuste_id = ?, aplicado_date = datetime('now') WHERE id IN (${fila.ids.split(',').map(() => '?').join(',')})`)
          .run(ajusteId, ...fila.ids.split(','));

        notificar(
          fila.usuario,
          fila.neto > 0 ? '🎉 Horas de blackjack acreditadas' : 'Horas de blackjack aplicadas',
          `Se liquidó ${periodo}: ${signo}${fmtMinutos(Math.abs(fila.neto))} como adicional en tus horas.`,
          '/alumno'
        );
        aplicados.push({ usuario: fila.usuario, nombre: fila.usuario_nombre, neto_min: fila.neto, ajuste_id: ajusteId });
      }
      return aplicados;
    });

    const resultado = liquidar.immediate();

    registrarEnBitacora(
      req.user.id, 'Liquidar blackjack', 'Blackjack',
      `periodo=${periodo} personas=${resultado.length} netoTotal=${resultado.reduce((a, r) => a + r.neto_min, 0)}min`
    );

    // Los ajustes cambian las horas validadas: puede alcanzarse la meta y
    // corresponder una constancia automática.
    for (const r of resultado) {
      if (r.neto_min) {
        try { verificarConstanciaAutomatica(r.usuario); } catch { /* nunca debe romper la liquidación */ }
      }
    }
    res.json({ ok: true, periodo, aplicados: resultado });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/blackjack/admin/movimientos/:id/anular
// Anula un movimiento. Si ya estaba aplicado, revierte el ajuste de horas.
router.post('/admin/movimientos/:id/anular', authMiddleware, (req, res) => {
  if (!soloAdmin(req, res)) return;
  try {
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
    const anular = db.transaction(() => {
      const m = db.prepare('SELECT * FROM blackjack_movimientos WHERE id = ?').get(req.params.id);
      if (!m) { const e = new Error('Movimiento no encontrado'); e.status = 404; throw e; }
      if (m.estado === 'anulado') { const e = new Error('Ese movimiento ya está anulado'); e.status = 409; throw e; }

      // Si ya generó un ajuste, compensarlo con un ajuste inverso en vez de
      // borrarlo: la fila original queda como rastro en el historial de horas.
      if (m.estado === 'aplicado' && m.ajuste_id) {
        db.prepare(
          `INSERT INTO ajustes_horas (id, usuario, minutos, tipo, periodo, motivo, creado_por, creado_por_nombre)
           VALUES (?, ?, ?, 'blackjack', ?, ?, ?, ?)`
        ).run(
          uuidv4(), m.usuario, -m.delta_min, m.periodo,
          `Anulación de movimiento de blackjack ${m.id.slice(0, 8)}${motivo ? `: ${motivo}` : ''}`,
          req.user.id, nombreDe(req.user.id)
        );
      }
      db.prepare(`UPDATE blackjack_movimientos SET estado = 'anulado' WHERE id = ?`).run(m.id);
      return m;
    });

    const m = anular.immediate();
    registrarEnBitacora(req.user.id, 'Anular movimiento de blackjack', 'Blackjack', `${m.id} delta=${m.delta_min}min motivo=${motivo || '(sin motivo)'}`);
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
