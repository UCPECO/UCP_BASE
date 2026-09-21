// Cliente de la API de Tetris. Reutiliza `apiFetch` del cliente principal para
// no duplicar la lectura del token ni el manejo de errores (el patrón que
// originó el BUG-41 de la revisión: cuatro sitios leyendo localStorage a mano).
import { apiFetch } from './base44Client';

export const tetris = {
  // Ranking global: mejor puntaje de cada usuario + mi récord y posición
  ranking: (limit = 20) => apiFetch(`/tetris/ranking?limit=${encodeURIComponent(limit)}`),

  // Mi historial de partidas
  mios: (limit = 20) => apiFetch(`/tetris/mios?limit=${encodeURIComponent(limit)}`),

  // Registrar una partida terminada
  enviar: (partida) =>
    apiFetch('/tetris/puntaje', {
      method: 'POST',
      body: JSON.stringify(partida),
    }),

  borrar: (id) => apiFetch(`/tetris/puntaje/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export default tetris;
