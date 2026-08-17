// Utilidades compartidas para cálculo de horas y progreso UCP

export const META_HORAS_DEFAULT = 480;

// Calcula horas entre dos tiempos "HH:MM" → número decimal
export function calcularHoras(entrada, salida) {
  if (!entrada || !salida) return 0;
  const [h1, m1] = entrada.split(":").map(Number);
  const [h2, m2] = salida.split(":").map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // cruza medianoche
  return Math.round((mins / 60) * 100) / 100;
}

// Suma horas de registros cerrados Y validados (las horas que cuentan para la meta)
export function sumarHorasRegistros(registros) {
  if (!registros) return 0;
  return registros.reduce((acc, r) => {
    if ((r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && r.validado) {
      return acc + (calcularHoras(r.hora_entrada, r.hora_salida) || 0);
    }
    return acc;
  }, 0);
}

// Suma horas cerradas que aún no valida el encargado/admin
export function sumarHorasPorValidar(registros) {
  if (!registros) return 0;
  return registros.reduce((acc, r) => {
    if ((r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && !r.validado) {
      return acc + (calcularHoras(r.hora_entrada, r.hora_salida) || 0);
    }
    return acc;
  }, 0);
}

// Suma horas de bonos
export function sumarHorasBonos(bonos) {
  if (!bonos) return 0;
  return bonos.reduce((acc, b) => acc + (b.horas || 0), 0);
}

// Calcula porcentaje hacia la meta
export function calcularPorcentaje(totalHoras, meta) {
  const m = meta || META_HORAS_DEFAULT;
  return Math.min(100, Math.round((totalHoras / m) * 100));
}

// Genera barra visual ASCII
export function generarBarraVisual(totalHoras, meta) {
  const pct = calcularPorcentaje(totalHoras, meta);
  const filled = Math.floor(pct / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty) + " " + pct + "%";
}

// Genera URL de imagen QR
export function generarQrUrl(data) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}`;
}

// Horas restantes hacia la meta
export function horasRestantes(totalHoras, meta) {
  const m = meta || META_HORAS_DEFAULT;
  return Math.max(0, Math.round((m - totalHoras) * 100) / 100);
}

// Formatea fecha ISO a legible
export function formatearFecha(fecha) {
  if (!fecha) return "—";
  try {
    return new Date(fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return fecha; }
}

// Día de la semana actual en español (zona Centro de México)
export function diaDeHoy() {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", weekday: "short" }).format(new Date());
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return dias[map[wd] ?? 0];
}

// Fecha de hoy en YYYY-MM-DD (zona Centro de México)
export function fechaHoy() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// Hora actual HH:MM en zona Centro de México (el preview corre en UTC)
export function horaActual() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date());
}

// Color de badge según estado
export const ESTADO_COLORS = {
  activo: "bg-emerald-100 text-emerald-700",
  completado: "bg-blue-100 text-blue-700",
  cancelado: "bg-rose-100 text-rose-700",
  abierto: "bg-amber-100 text-amber-700",
  cerrado: "bg-emerald-100 text-emerald-700",
  incompleto: "bg-orange-100 text-orange-700",
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-rose-100 text-rose-700",
  regresada: "bg-blue-100 text-blue-700",
  reportada: "bg-orange-100 text-orange-700",
  en_revision: "bg-blue-100 text-blue-700",
  en_proceso: "bg-indigo-100 text-indigo-700",
  resuelta: "bg-emerald-100 text-emerald-700",
  cerrada: "bg-slate-100 text-slate-700",
  bajo_revision: "bg-orange-100 text-orange-700",
};

export const PRIORIDAD_COLORS = {
  baja: "bg-slate-100 text-slate-600",
  media: "bg-blue-100 text-blue-700",
  alta: "bg-orange-100 text-orange-700",
  urgente: "bg-rose-100 text-rose-700",
};

// Devuelve el nombre completo del usuario priorizando nombre_completo, luego full_name.
// Nunca usa el correo como nombre visible (evita mostrar "juan" en vez de "Juan Pérez").
export function nombreUsuario(u) {
  if (!u) return "Sin nombre";
  return u.nombre_completo || u.full_name || "Sin nombre";
}

// ===== Disponibilidad semanal (horario laboral 9:00–17:00) =====
export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
export const JORNADA_INICIO = 540;  // 09:00 en minutos
export const JORNADA_FIN = 1020;    // 17:00 en minutos

export function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}
export function aHHMM(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Calcula, por día de semana, los huecos libres dentro de la jornada laboral
// considerando las clases del alumno. Devuelve { clases, libres, horasLibres, horasOcupadas } por día.
export function calcularDisponibilidad(horarios, inicioMin = JORNADA_INICIO, finMin = JORNADA_FIN) {
  const porDia = {};
  DIAS_SEMANA.forEach(d => { porDia[d] = []; });
  (horarios || []).forEach(h => { if (porDia[h.dia_semana]) porDia[h.dia_semana].push(h); });

  const resultado = {};
  DIAS_SEMANA.forEach(d => {
    const clases = (porDia[d] || []).slice().sort((a, b) => aMinutos(a.hora_inicio) - aMinutos(b.hora_inicio));
    const ocupados = [];
    clases.forEach(c => {
      const s = Math.max(aMinutos(c.hora_inicio), inicioMin);
      const e = Math.min(aMinutos(c.hora_fin), finMin);
      if (e > s) ocupados.push([s, e]);
    });
    ocupados.sort((a, b) => a[0] - b[0]);
    const merged = [];
    ocupados.forEach(([s, e]) => {
      if (merged.length && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else merged.push([s, e]);
    });
    const libres = [];
    let cursor = inicioMin;
    merged.forEach(([s, e]) => { if (s > cursor) libres.push([cursor, s]); cursor = Math.max(cursor, e); });
    if (cursor < finMin) libres.push([cursor, finMin]);
    const horasOcupadas = merged.reduce((a, [s, e]) => a + (e - s), 0) / 60;
    const horasLibres = libres.reduce((a, [s, e]) => a + (e - s), 0) / 60;
    resultado[d] = {
      clases,
      libres,
      horasOcupadas: Math.round(horasOcupadas * 100) / 100,
      horasLibres: Math.round(horasLibres * 100) / 100,
    };
  });
  return resultado;
}