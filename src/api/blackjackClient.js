// Cliente de la API de Blackjack. Reutiliza `apiFetch` del cliente principal
// para no duplicar la lectura del token ni el manejo de errores (el patrón que
// originó el BUG-41 de la revisión).
import { apiFetch } from './base44Client';

export const blackjack = {
  // Config visible + mi saldo + límite diario + partida en curso (para reanudar)
  estado: () => apiFetch('/blackjack/estado'),

  // Jugar
  crearPartida: (apuestaMin) =>
    apiFetch('/blackjack/partida', { method: 'POST', body: JSON.stringify({ apuesta_min: apuestaMin }) }),
  accion: (partidaId, accion) =>
    apiFetch('/blackjack/accion', { method: 'POST', body: JSON.stringify({ partida_id: partidaId, accion }) }),
  misMovimientos: (limit = 30) =>
    apiFetch(`/blackjack/mis-movimientos?limit=${encodeURIComponent(limit)}`),

  // Administración
  resumen: (periodo) =>
    apiFetch(`/blackjack/admin/resumen${periodo ? `?periodo=${encodeURIComponent(periodo)}` : ''}`),
  guardarConfig: (cfg) =>
    apiFetch('/blackjack/admin/config', { method: 'POST', body: JSON.stringify(cfg) }),
  movimientos: (filtros = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    }
    const s = qs.toString();
    return apiFetch(`/blackjack/admin/movimientos${s ? `?${s}` : ''}`);
  },
  liquidar: (periodo) =>
    apiFetch('/blackjack/admin/liquidar', { method: 'POST', body: JSON.stringify({ periodo }) }),
  anularMovimiento: (id, motivo) =>
    apiFetch(`/blackjack/admin/movimientos/${encodeURIComponent(id)}/anular`, {
      method: 'POST',
      body: JSON.stringify({ motivo: motivo || '' }),
    }),
};

// Formateo compartido entre la pantalla de juego y el panel de administración.
// Espejo de fmtMinutos() del servidor: las dos deben coincidir o el jugador y el
// admin verían cifras distintas para el mismo movimiento.
export function fmtMinutos(min) {
  const m = Math.round(Number(min) || 0);
  const signo = m < 0 ? '-' : '';
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  if (h === 0) return r === 0 ? '0 h' : `${signo}${r} min`;
  return r === 0 ? `${signo}${h} h` : `${signo}${h} h ${r} min`;
}

export function fmtHoras(min) {
  return `${(Math.round(Number(min) || 0) / 60).toFixed(2)} h`;
}

export default blackjack;
