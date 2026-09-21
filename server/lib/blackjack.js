// Lógica pura del blackjack, sin Express ni SQLite: se puede probar en Node.
//
// IMPORTANTE: todo el juego es autoritativo en el servidor. El cliente solo
// envía acciones (pedir / plantarse / doblar) y recibe las cartas ya reveladas.
// Si el resultado se calculara en el navegador, cualquiera podría falsearlo con
// las DevTools — y aquí se apuestan horas de servicio reales.
//
// El mazo barajado NUNCA se devuelve al cliente: se guarda en la fila de la
// partida y solo se revelan las cartas ya repartidas.

import { randomInt } from 'crypto';

export const PALOS = ['\u2660', '\u2665', '\u2666', '\u2663']; // ♠ ♥ ♦ ♣
export const RANGOS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Fisher-Yates con crypto.randomInt: Math.random no es criptográficamente
// seguro y su secuencia se puede predecir, lo que permitiría anticipar cartas.
export function barajar(numMazos = 4) {
  const mazo = [];
  for (let d = 0; d < numMazos; d++) {
    for (const p of PALOS) for (const r of RANGOS) mazo.push({ r, p });
  }
  for (let i = mazo.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1); // [0, i]
    [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
  }
  return mazo;
}

export function valorCarta(rango) {
  if (rango === 'A') return 11;
  if (rango === 'K' || rango === 'Q' || rango === 'J' || rango === '10') return 10;
  const n = Number(rango);
  return Number.isFinite(n) ? n : 0;
}

// Valor de la mano ajustando los ases: cada as vale 11 y se degrada a 1 mientras
// la mano se pase de 21. Devuelve también si queda algún as blando.
export function valorMano(cartas) {
  let total = 0;
  let ases = 0;
  for (const c of cartas) {
    total += valorCarta(c.r);
    if (c.r === 'A') ases++;
  }
  while (total > 21 && ases > 0) {
    total -= 10;
    ases--;
  }
  return { total, blanda: ases > 0 };
}

export function esBlackjack(cartas) {
  return cartas.length === 2 && valorMano(cartas).total === 21;
}

// El dealer pide hasta 17 o más. Se planta en 17 blando (regla estándar y la
// más simple de explicar a los jugadores).
export function jugarDealer(mano, mazo) {
  const cartas = [...mano];
  const resto = [...mazo];
  while (valorMano(cartas).total < 17) {
    if (resto.length === 0) break;
    cartas.push(resto.shift());
  }
  return { mano: cartas, mazo: resto };
}

export const RESULTADOS = {
  BLACKJACK: 'blackjack',
  VICTORIA: 'victoria',
  DERROTA: 'derrota',
  EMPATE: 'empate',
};

// Resuelve la mano y devuelve el resultado y el delta neto en MINUTOS.
// Trabajar en minutos enteros evita la deriva de punto flotante que ya causó
// varios bugs de horas en esta base (ver causa raíz A de la revisión).
//
// Pagos: blackjack 3:2, victoria 1:1, empate 0, derrota -apuesta.
// `doble` indica que la apuesta se duplicó al pedir una sola carta más.
export function resolver({ manoJugador, manoDealer, apuestaMin, doble }) {
  const apuesta = doble ? apuestaMin * 2 : apuestaMin;
  const bjJugador = esBlackjack(manoJugador);
  const bjDealer = esBlackjack(manoDealer);
  const j = valorMano(manoJugador).total;
  const d = valorMano(manoDealer).total;

  // El blackjack natural se paga 3:2 y no se duplica por el "doble"
  if (bjJugador && !bjDealer) {
    const premio = Math.round((apuestaMin * 3) / 2);
    return { resultado: RESULTADOS.BLACKJACK, delta: premio, apuesta_efectiva: apuestaMin };
  }
  if (bjJugador && bjDealer) {
    return { resultado: RESULTADOS.EMPATE, delta: 0, apuesta_efectiva: apuestaMin };
  }
  if (bjDealer) {
    return { resultado: RESULTADOS.DERROTA, delta: -apuesta, apuesta_efectiva: apuesta };
  }
  if (j > 21) {
    return { resultado: RESULTADOS.DERROTA, delta: -apuesta, apuesta_efectiva: apuesta };
  }
  if (d > 21 || j > d) {
    return { resultado: RESULTADOS.VICTORIA, delta: apuesta, apuesta_efectiva: apuesta };
  }
  if (j === d) {
    return { resultado: RESULTADOS.EMPATE, delta: 0, apuesta_efectiva: apuesta };
  }
  return { resultado: RESULTADOS.DERROTA, delta: -apuesta, apuesta_efectiva: apuesta };
}

// Etiqueta legible de una carta, p. ej. "A♠" o "10♥"
export function etiqueta(c) {
  return `${c.r}${c.p}`;
}

// Periodo "YYYY-MM" en hora de México: el mes contra el que se difiere el
// movimiento. Se calcula con la misma zona que el resto del sistema para no
// repetir los desfases UTC de la revisión (causa raíz B).
export function periodoActual(fecha = new Date()) {
  const s = fecha.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const t = new Date(s);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}`;
}

// Fecha "YYYY-MM-DD" en hora de México, para el límite diario y la vigencia.
export function fechaMexico(fecha = new Date()) {
  const s = fecha.toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const t = new Date(s);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function fmtMinutos(min) {
  const m = Math.round(Number(min) || 0);
  const signo = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  // Sin esta rama, -45 salía como "-0 h 45 min"
  if (h === 0) return r === 0 ? '0 h' : `${signo}${r} min`;
  return r === 0 ? `${signo}${h} h` : `${signo}${h} h ${r} min`;
}
