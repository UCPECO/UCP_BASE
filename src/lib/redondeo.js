// Redondeo de fichajes a bloques de 10 minutos.
//
// Regla oficial UCP: la duración de cada fichaje se redondea al múltiplo de
// 10 minutos más cercano (residuo >= 5 redondea hacia arriba). La diferencia
// entre los minutos reales y los redondeados (los "minutos truncados") se
// acumula por persona y por mes, y el administrador puede acreditarla desde
// Validación y ajustes.

// Minutos reales entre hora_entrada y hora_salida (soporta cruce de medianoche)
export function minutosRegistro(r) {
  if (!r?.hora_entrada || !r?.hora_salida) return 0;
  const [h1, m1] = String(r.hora_entrada).split(":").map(Number);
  const [h2, m2] = String(r.hora_salida).split(":").map(Number);
  let mins = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
  if (mins < 0) mins += 24 * 60;
  return mins;
}

// Redondeo al múltiplo de 10 más cercano (mod 10 >= 5 sube al siguiente)
export function redondearA10(mins) {
  return Math.round((mins || 0) / 10) * 10;
}

// Minutos oficiales (redondeados) de un fichaje
export function minutosOficiales(r) {
  return redondearA10(minutosRegistro(r));
}

// Residuo del fichaje: minutos reales - minutos oficiales.
// Positivo = se truncaron minutos a favor del alumno pendientes de acreditar.
// Negativo = el redondeo regaló minutos (se compensa con otros fichajes).
export function residuoRegistro(r) {
  return minutosRegistro(r) - minutosOficiales(r);
}

// Horas oficiales de un fichaje (redondeadas), con 2 decimales
export function horasOficialesRegistro(r) {
  return Math.round((minutosOficiales(r) / 60) * 100) / 100;
}

// Periodo mensual "YYYY-MM" de una fecha "YYYY-MM-DD"
export function periodoDe(fecha) {
  return (fecha || "").slice(0, 7);
}

// Resumen mensual de un conjunto de registros (ya filtrados por usuario/mes)
export function resumenMensual(registros) {
  let reales = 0, oficiales = 0;
  (registros || []).forEach((r) => {
    if (r.estado_registro !== "cerrado" && r.estado_registro !== "incompleto") return;
    reales += minutosRegistro(r);
    oficiales += minutosOficiales(r);
  });
  return {
    minutosReales: reales,
    minutosOficiales: oficiales,
    residuo: reales - oficiales,
    horasOficiales: Math.round((oficiales / 60) * 100) / 100,
  };
}

export function fmtMinutos(mins) {
  const m = Math.round(mins || 0);
  const signo = m < 0 ? "-" : "";
  const abs = Math.abs(m);
  const h = Math.floor(abs / 60);
  const r = abs % 60;
  return h > 0 ? `${signo}${h} h ${r} min` : `${signo}${r} min`;
}
