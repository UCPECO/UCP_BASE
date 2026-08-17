import React from "react";
import { Check } from "lucide-react";
import { DIAS_SEMANA, JORNADA_INICIO, JORNADA_FIN, aMinutos, aHHMM } from "@/lib/ucpUtils";

function pct(min) { return ((min - JORNADA_INICIO) / (JORNADA_FIN - JORNADA_INICIO)) * 100; }

export default function DisponibilidadSemanal({ disponibilidad }) {
  const MARCAS = [540, 660, 780, 900, 1020]; // 09, 11, 13, 15, 17

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold font-heading">Disponibilidad semanal</h3>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-emerald-400" /> Libre</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-rose-400" /> Clase</span>
        </div>
      </div>

      <div className="mb-4 flex justify-between text-[10px] text-muted-foreground px-1">
        {MARCAS.map(m => <span key={m}>{aHHMM(m)}</span>)}
      </div>

      <div className="space-y-3">
        {DIAS_SEMANA.map(dia => {
          const d = disponibilidad[dia] || { clases: [], libres: [], horasLibres: 0 };
          return (
            <div key={dia} className="grid grid-cols-[72px_1fr_auto] items-center gap-3">
              <span className="text-sm font-medium">{dia}</span>
              <div className="relative h-8 bg-muted rounded-lg overflow-hidden">
                {d.libres.map(([s, e], i) => (
                  <div key={`l${i}`} className="absolute top-0 bottom-0 bg-emerald-400/85 border-x border-emerald-500"
                    style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }}
                    title={`Libre ${aHHMM(s)}–${aHHMM(e)}`} />
                ))}
                {d.clases.map((c, i) => {
                  const s = Math.max(aMinutos(c.hora_inicio), JORNADA_INICIO);
                  const e = Math.min(aMinutos(c.hora_fin), JORNADA_FIN);
                  if (e <= s) return null;
                  return (
                    <div key={`c${i}`} className="absolute top-0 bottom-0 bg-rose-400 border-x border-rose-500 flex items-center justify-center"
                      style={{ left: `${pct(s)}%`, width: `${pct(e) - pct(s)}%` }}
                      title={`${c.materia || "Clase"} ${c.hora_inicio}–${c.hora_fin}`}>
                      {c.materia && (e - s) > 75 ? <span className="text-[10px] text-white font-medium truncate px-1">{c.materia}</span> : null}
                    </div>
                  );
                })}
              </div>
              <span className={`text-sm font-medium tabular-nums w-10 text-right ${d.horasLibres > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                {d.horasLibres}h
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" /> Huecos disponibles para trabajar (9–17h)
        </p>
        <div className="space-y-2">
          {DIAS_SEMANA.map(dia => {
            const d = disponibilidad[dia] || { libres: [] };
            if (d.libres.length === 0) return null;
            return (
              <div key={dia} className="flex items-start gap-2 text-sm">
                <span className="font-medium w-20 shrink-0">{dia}</span>
                <div className="flex flex-wrap gap-1.5">
                  {d.libres.map(([s, e], i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                      {aHHMM(s)}–{aHHMM(e)}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
          {DIAS_SEMANA.every(d => (disponibilidad[d]?.libres || []).length === 0) && (
            <p className="text-sm text-muted-foreground">Sin huecos disponibles esta semana.</p>
          )}
        </div>
      </div>
    </div>
  );
}