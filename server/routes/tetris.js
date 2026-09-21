// Tetris: puntajes globales.
// Ruta dedicada (no pasa por el CRUD genérico de entidades) porque el ranking
// necesita agregaciones y porque así el módulo es autocontenido: crea su propia
// tabla de forma idempotente al cargarse, sin tocar setup.js.
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/security.js';

const router = Router();

// ===== Esquema =====
// Idempotente: se ejecuta en cada arranque y no pisa datos existentes.
db.exec(`
  CREATE TABLE IF NOT EXISTS tetris_puntajes (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    usuario_nombre TEXT,
    puntos INTEGER NOT NULL DEFAULT 0,
    lineas INTEGER NOT NULL DEFAULT 0,
    nivel INTEGER NOT NULL DEFAULT 1,
    piezas INTEGER NOT NULL DEFAULT 0,
    duracion_seg INTEGER NOT NULL DEFAULT 0,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);
// El ranking ordena por puntos: sin índice sería un scan completo en cada lectura
db.exec(`CREATE INDEX IF NOT EXISTS idx_tetris_puntos ON tetris_puntajes (puntos DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_tetris_usuario ON tetris_puntajes (usuario, puntos DESC)`);

// Un participante no debería poder escribir un nombre distinto al suyo: se
// resuelve siempre en el servidor desde la tabla users.
const MEJOR_POR_USUARIO = `
  SELECT usuario, usuario_nombre, puntos, lineas, nivel, piezas, duracion_seg, created_date
  FROM (
    SELECT t.*,
           ROW_NUMBER() OVER (
             PARTITION BY t.usuario
             ORDER BY t.puntos DESC, t.created_date ASC
           ) AS rn
    FROM tetris_puntajes t
  )
  WHERE rn = 1
`;

// Límite de envío: una partida dura minutos, así que 20 envíos por minuto es
// holgado para jugar y suficiente para frenar el spam contra el ranking.
const enviarLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  mensaje: 'Demasiadas partidas enviadas. Espera un momento.',
});

// Topes de sanidad: evitan que un cliente modificado escriba cifras absurdas en
// el ranking global. Son muy holgados (nadie llega jugando limpio) pero acotan.
const TOPES = {
  puntos: [0, 50_000_000],
  lineas: [0, 100_000],
  nivel: [1, 200],
  piezas: [0, 500_000],
  duracion_seg: [0, 86_400],
};

function enteroValido(valor, campo, porDefecto) {
  const [min, max] = TOPES[campo];
  const n = Math.trunc(Number(valor));
  if (!Number.isFinite(n) || n < min || n > max) return porDefecto;
  return n;
}

function nombreDe(usuarioId) {
  const u = db
    .prepare('SELECT nombre_completo, full_name, email FROM users WHERE id = ?')
    .get(usuarioId);
  return u?.nombre_completo || u?.full_name || u?.email || 'Anónimo';
}

// ===== Ranking global =====
// GET /api/tetris/ranking?limit=20
// Devuelve el mejor puntaje de cada usuario (no todas las partidas, para que
// nadie inunde el ranking) y, aparte, la posición y el récord de quien consulta.
router.get('/ranking', authMiddleware, (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const filas = db.prepare(`${MEJOR_POR_USUARIO} ORDER BY puntos DESC, created_date ASC LIMIT ?`).all(limite);
    const ranking = filas.map((f, i) => ({
      posicion: i + 1,
      usuario: f.usuario,
      nombre: f.usuario_nombre || 'Anónimo',
      puntos: f.puntos,
      lineas: f.lineas,
      nivel: f.nivel,
      piezas: f.piezas,
      duracion_seg: f.duracion_seg,
      fecha: f.created_date,
      soy_yo: f.usuario === req.user.id,
    }));

    // Récord y posición global de quien consulta
    const mio = db
      .prepare('SELECT puntos, lineas, nivel, created_date FROM tetris_puntajes WHERE usuario = ? ORDER BY puntos DESC, created_date ASC LIMIT 1')
      .get(req.user.id);

    let posicion = null;
    if (mio) {
      // Cuántos usuarios tienen un mejor récord que el mío
      const mejores = db
        .prepare(`SELECT COUNT(*) AS n FROM (${MEJOR_POR_USUARIO}) WHERE puntos > ?`)
        .get(mio.puntos).n;
      posicion = mejores + 1;
    }

    const totalJugadores = db.prepare('SELECT COUNT(DISTINCT usuario) AS n FROM tetris_puntajes').get().n;
    const totalPartidas = db.prepare('SELECT COUNT(*) AS n FROM tetris_puntajes').get().n;

    res.json({
      ranking,
      mio: mio ? { puntos: mio.puntos, lineas: mio.lineas, nivel: mio.nivel, fecha: mio.created_date, posicion } : null,
      total_jugadores: totalJugadores,
      total_partidas: totalPartidas,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Mis partidas =====
// GET /api/tetris/mios?limit=20
router.get('/mios', authMiddleware, (req, res) => {
  try {
    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filas = db
      .prepare(
        'SELECT id, puntos, lineas, nivel, piezas, duracion_seg, created_date FROM tetris_puntajes WHERE usuario = ? ORDER BY created_date DESC LIMIT ?'
      )
      .all(req.user.id, limite);
    res.json({ partidas: filas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Registrar una partida =====
// POST /api/tetris/puntaje
router.post('/puntaje', authMiddleware, enviarLimiter, (req, res) => {
  try {
    const body = req.body || {};
    const puntos = enteroValido(body.puntos, 'puntos', null);
    if (puntos === null) {
      return res.status(400).json({ error: 'Puntaje inválido' });
    }

    const linea = {
      lineas: enteroValido(body.lineas, 'lineas', 0),
      nivel: enteroValido(body.nivel, 'nivel', 1),
      piezas: enteroValido(body.piezas, 'piezas', 0),
      duracion_seg: enteroValido(body.duracion_seg, 'duracion_seg', 0),
    };

    // Coherencia mínima: no se pueden hacer puntos sin colocar piezas, y las
    // líneas limpiadas no pueden superar lo que dan las piezas colocadas.
    if (puntos > 0 && linea.piezas === 0) {
      return res.status(400).json({ error: 'Partida incoherente: hay puntos pero ninguna pieza colocada' });
    }
    if (linea.lineas > linea.piezas) {
      return res.status(400).json({ error: 'Partida incoherente: más líneas que piezas colocadas' });
    }

    const id = uuidv4();
    db.prepare(
      `INSERT INTO tetris_puntajes (id, usuario, usuario_nombre, puntos, lineas, nivel, piezas, duracion_seg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.user.id, nombreDe(req.user.id), puntos, linea.lineas, linea.nivel, linea.piezas, linea.duracion_seg);

    // ¿Es récord personal? ¿Entró al top del ranking global?
    const anterior = db
      .prepare('SELECT puntos FROM tetris_puntajes WHERE usuario = ? AND id != ? ORDER BY puntos DESC LIMIT 1')
      .get(req.user.id, id);
    const esRecord = !anterior || puntos > anterior.puntos;

    const mejores = db
      .prepare(`SELECT COUNT(*) AS n FROM (${MEJOR_POR_USUARIO}) WHERE puntos > ?`)
      .get(puntos).n;
    const posicion = mejores + 1;

    res.status(201).json({
      ok: true,
      id,
      es_record_personal: esRecord,
      posicion_global: posicion,
      total_jugadores: db.prepare('SELECT COUNT(DISTINCT usuario) AS n FROM tetris_puntajes').get().n,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Borrar mis partidas (solo el propio usuario; admin puede borrar todo) =====
// DELETE /api/tetris/puntaje/:id
router.delete('/puntaje/:id', authMiddleware, (req, res) => {
  try {
    const fila = db.prepare('SELECT usuario, puntos FROM tetris_puntajes WHERE id = ?').get(req.params.id);
    if (!fila) return res.status(404).json({ error: 'Partida no encontrada' });

    const solicitante = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    const esAdmin = solicitante?.role === 'admin';
    if (!esAdmin && fila.usuario !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes borrar tus propias partidas' });
    }

    db.prepare('DELETE FROM tetris_puntajes WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
