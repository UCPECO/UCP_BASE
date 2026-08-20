import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// Tarjeta de KPI. Si recibe `to`, toda la tarjeta es un enlace (ataljo
// de navegación, muy útil en móvil) con respuesta táctil.
export default function KpiCard({ icon: Icon, label, value, hint, tone = "primary", to }) {
  const tones = {
    primary: "from-violet-500/15 to-cyan-500/10 text-violet-700",
    accent: "from-amber-500/10 to-orange-500/5 text-amber-700",
    blue: "from-cyan-500/10 to-sky-500/5 text-cyan-700",
    rose: "from-pink-500/10 to-rose-500/5 text-pink-700",
    slate: "from-slate-500/10 to-slate-400/5 text-slate-700",
  };
  const contenido = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-lg sm:text-3xl font-bold mt-1.5 sm:mt-2 font-heading break-words">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </div>
      {Icon && (
        <div className={cn("h-9 w-9 sm:h-11 sm:w-11 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0", tones[tone])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      )}
    </div>
  );

  const clases = cn(
    "block bg-card rounded-2xl border border-border p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all",
    to && "active:scale-[0.97] cursor-pointer"
  );

  return to ? <Link to={to} className={clases}>{contenido}</Link> : <div className={clases}>{contenido}</div>;
}
