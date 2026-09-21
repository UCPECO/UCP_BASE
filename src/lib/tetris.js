// Lógica pura del Tetris, sin React ni DOM: se puede probar en Node.
// Convenciones: el tablero es una matriz [filas][columnas] donde cada celda es
// null (vacía) o la letra de la pieza que la ocupa (para poder pintarla del
// color que le corresponde). Las coordenadas de pieza son { x, y, rot }.

export const COLUMNAS = 10;
export const FILAS = 20;

// Matriz base de cada tetrominó. Se rotan programáticamente para no tener que
// mantener a mano las cuatro orientaciones de las siete piezas.
export const FORMAS = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

export const TIPOS = Object.keys(FORMAS);

// Clases de color por pieza (tokens del tema de la app, no colores fijos, para
// que el juego respete el modo claro/oscuro/Selva igual que el resto).
export const COLOR_PIEZA = {
  I: 'bg-cyan-400',
  O: 'bg-yellow-400',
  T: 'bg-purple-500',
  S: 'bg-green-500',
  Z: 'bg-red-500',
  J: 'bg-blue-600',
  L: 'bg-orange-500',
};

// Puntos por número de líneas eliminadas de una vez, según la guía oficial de
// Tetris, multiplicados por el nivel.
export const PUNTOS_LINEAS = [0, 100, 300, 500, 800];

export function crearTablero() {
  return Array.from({ length: FILAS }, () => Array(COLUMNAS).fill(null));
}

// Rotación horaria de una matriz cuadrada: transpuesta + filas invertidas.
export function rotarMatriz(m) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[x][n - 1 - y] = m[y][x];
    }
  }
  return out;
}

// Las 4 orientaciones de cada tipo, precalculadas una sola vez.
export const ORIENTACIONES = TIPOS.reduce((acc, t) => {
  const estados = [];
  let m = FORMAS[t];
  for (let i = 0; i < 4; i++) {
    estados.push(m);
    m = rotarMatriz(m);
  }
  acc[t] = estados;
  return acc;
}, {});

export function matrizDe(tipo, rot) {
  return ORIENTACIONES[tipo][((rot % 4) + 4) % 4];
}

export function tamanoDe(tipo) {
  return ORIENTACIONES[tipo][0].length;
}

// ¿Choca la pieza con los bordes o con celdas ya ocupadas?
export function colisiona(tablero, tipo, x, y, rot) {
  const m = matrizDe(tipo, rot);
  for (let fy = 0; fy < m.length; fy++) {
    for (let fx = 0; fx < m[fy].length; fx++) {
      if (!m[fy][fx]) continue;
      const tx = x + fx;
      const ty = y + fy;
      if (tx < 0 || tx >= COLUMNAS || ty >= FILAS) return true;
      // Por encima del techo todavía no hay choque (las piezas entran desde ahí)
      if (ty < 0) continue;
      if (tablero[ty][tx]) return true;
    }
  }
  return false;
}

// "Bolsa de 7": el generador estándar de Tetris. Baraja las siete piezas y las
// reparte antes de volver a barajar, así ninguna pieza tarda más de 12 turnos en
// salir y no hay sequías largas de la pieza I.
export function nuevaBolsa() {
  const b = [...TIPOS];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function posicionInicial(tipo) {
  // Centrado horizontalmente y asomando por arriba del techo
  const n = tamanoDe(tipo);
  return { x: Math.floor((COLUMNAS - n) / 2), y: tipo === 'I' ? -1 : 0, rot: 0 };
}

// Intentos de wall kick al rotar: primero sin desplazar, luego empujando a los
// lados y por último subiendo un renglón (necesario para la I junto a la pared).
export const KICKS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
];

export function intentarRotar(tablero, pieza, direccion) {
  const rot = (((pieza.rot + direccion) % 4) + 4) % 4;
  for (const [dx, dy] of KICKS) {
    const x = pieza.x + dx;
    const y = pieza.y + dy;
    if (!colisiona(tablero, pieza.tipo, x, y, rot)) {
      return { ...pieza, x, y, rot };
    }
  }
  return null; // no cabe en ninguna posición: la rotación se descarta
}

export function intentarMover(tablero, pieza, dx, dy) {
  const x = pieza.x + dx;
  const y = pieza.y + dy;
  if (colisiona(tablero, pieza.tipo, x, y, pieza.rot)) return null;
  return { ...pieza, x, y };
}

// Fila más baja que alcanzaría la pieza si cayera en picada (para la sombra).
export function filaDeAterrizaje(tablero, pieza) {
  let y = pieza.y;
  while (!colisiona(tablero, pieza.tipo, pieza.x, y + 1, pieza.rot)) y++;
  return y;
}

// Graba la pieza en el tablero. Devuelve un tablero NUEVO (no muta el anterior)
// y si la pieza quedó total o parcialmente por encima del techo → fin de partida.
export function fijarPieza(tablero, pieza) {
  const nuevo = tablero.map((fila) => [...fila]);
  const m = matrizDe(pieza.tipo, pieza.rot);
  let tocoTecho = false;
  let algunaVisible = false;
  for (let fy = 0; fy < m.length; fy++) {
    for (let fx = 0; fx < m[fy].length; fx++) {
      if (!m[fy][fx]) continue;
      const tx = pieza.x + fx;
      const ty = pieza.y + fy;
      if (ty < 0) {
        tocoTecho = true;
        continue;
      }
      if (ty < FILAS && tx >= 0 && tx < COLUMNAS) {
        nuevo[ty][tx] = pieza.tipo;
        algunaVisible = true;
      }
    }
  }
  return { tablero: nuevo, bloqueado: tocoTecho && !algunaVisible };
}

// Elimina las filas completas. Devuelve el tablero nuevo y cuántas cayeron.
export function limpiarLineas(tablero) {
  const completas = [];
  for (let y = 0; y < FILAS; y++) {
    if (tablero[y].every((c) => c !== null)) completas.push(y);
  }
  if (completas.length === 0) return { tablero, lineas: 0 };

  const set = new Set(completas);
  const quedan = tablero.filter((_, y) => !set.has(y));
  const nuevas = Array.from({ length: completas.length }, () => Array(COLUMNAS).fill(null));
  return { tablero: [...nuevas, ...quedan], lineas: completas.length };
}

export function puntosPorLineas(lineas, nivel) {
  return (PUNTOS_LINEAS[lineas] || 0) * nivel;
}

export function nivelPorLineas(lineas) {
  return Math.floor(lineas / 10) + 1;
}

// Milisegundos entre caídas. Arranca en 800 ms y baja hasta un suelo de 80 ms
// para que el nivel 15+ siga siendo jugable en móvil.
export function velocidadPorNivel(nivel) {
  return Math.max(80, Math.round(800 * Math.pow(0.85, nivel - 1)));
}

// Celdas de la pieza en coordenadas del tablero (para pintar la pieza activa y
// la sombra de aterrizaje sobre la misma rejilla).
export function celdasDe(pieza, dy = 0) {
  const m = matrizDe(pieza.tipo, pieza.rot);
  const out = [];
  for (let fy = 0; fy < m.length; fy++) {
    for (let fx = 0; fx < m[fy].length; fx++) {
      if (!m[fy][fx]) continue;
      const x = pieza.x + fx;
      const y = pieza.y + fy + dy;
      if (y >= 0 && y < FILAS && x >= 0 && x < COLUMNAS) out.push({ x, y });
    }
  }
  return out;
}

export function formatearDuracion(seg) {
  const s = Math.max(0, Math.floor(seg || 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
