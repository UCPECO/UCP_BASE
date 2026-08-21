import React, { useMemo } from "react";
import { Flame } from "lucide-react";
import NumeroAnimado from "@/components/ucp/NumeroAnimado";

// Convierte "YYYY-MM-DD" a Date local (sin sorpresas de zona horaria)
function fechaLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoDe(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Días laborales globales de UCP: lunes a viernes (fines de semana no cuentan
// ni rompen la racha; simplemente se saltan al retroceder).
function esLaboral(d) {
  return d.getDay() !== 0 && d.getDay() !== 6;
}
function retrocederLaboral(d) {
  do { d.setDate(d.getDate() - 1); } while (!esLaboral(d));
  return d;
}

// Cuenta los días laborales consecutivos con al menos un fichaje, hacia atrás
// desde hoy. Si el día laboral actual aún no tiene fichaje, la racha no se
// rompe: empieza a contar desde el día laboral anterior.
export function calcularRacha(registros) {
  const dias = new Set((registros || []).map((r) => r.fecha).filter(Boolean));
  const hoy = new Date();
  let cursor = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  // En fin de semana la racha no se juega: arranca en el último día laboral
  while (!esLaboral(cursor)) cursor.setDate(cursor.getDate() - 1);
  if (!dias.has(isoDe(cursor))) retrocederLaboral(cursor);
  let racha = 0;
  while (dias.has(isoDe(cursor))) {
    racha++;
    retrocederLaboral(cursor);
  }
  return racha;
}

export default function RachaFichajes({ registros }) {
  const racha = useMemo(() => calcularRacha(registros), [registros]);
  const activa = racha > 0;

  return (
    <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 flex items-center gap-4 shadow-sm">
      <div className={`h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
        activa ? "bg-gradient-to-br from-orange-500/20 to-rose-500/15 text-orange-500" : "bg-muted text-muted-foreground"
      }`}>
        <Flame className={`h-6 w-6 sm:h-7 sm:w-7 ${activa ? "fill-orange-500/30" : ""}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">Racha de asistencia</p>
        <p className="font-heading font-extrabold text-2xl sm:text-3xl leading-tight mt-0.5">
          <NumeroAnimado value={racha} /> <span className="text-base sm:text-lg font-bold text-muted-foreground">{racha === 1 ? "día" : "días"}</span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {activa ? "Cuenta de lunes a viernes: cada día laboral suma." : "Ficha hoy para encender tu racha."}
        </p>
      </div>
    </div>
  );
}
