// Cliente de la API de asistencia. Reutiliza apiFetch del cliente principal.
import { apiFetch } from './base44Client';

export const asistencia = {
  porPersona: (params = {}) =>
    apiFetch('/asistencia/por-persona', { method: 'POST', body: JSON.stringify(params) }),
  porDia: (params = {}) =>
    apiFetch('/asistencia/por-dia', { method: 'POST', body: JSON.stringify(params) }),
};

// Periodo "YYYY-MM" del mes anterior/siguiente al dado
export function desplazarPeriodo(periodo, delta) {
  const [y, m] = String(periodo).split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Fecha de hoy en hora de México como "YYYY-MM". No usar toISOString(): es UTC y
// a partir de las ~18:00 de México daría el mes siguiente el día 1.
export function periodoActual() {
  const s = new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const t = new Date(s);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
}

export function etiquetaPeriodo(periodo) {
  const [y, m] = String(periodo).split('-').map(Number);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${MESES[(m || 1) - 1]} ${y}`;
}

// Escape de CSV: neutraliza también la inyección de fórmulas de Excel
// (=, +, -, @ y tabulador), porque estas celdas llevan nombres capturados.
export function csvSeguro(v) {
  const s = String(v ?? '');
  const seguro = /^[=+\-@\t]/.test(s) ? `'${s}` : s;
  return /[",;\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

export function descargarCsv(nombre, filas) {
  const csv = '\uFEFF' + filas.map((f) => f.map(csvSeguro).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}.csv`;
  // Firefox no descarga si el enlace no está en el documento
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default asistencia;
