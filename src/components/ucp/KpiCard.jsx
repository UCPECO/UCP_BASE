import React from "react";
import { cn } from "@/lib/utils";

export default function KpiCard({ icon: Icon, label, value, hint, tone = "primary" }) {
  const tones = {
    primary: "from-emerald-500/10 to-teal-500/5 text-emerald-700",
    accent: "from-amber-500/10 to-orange-500/5 text-amber-700",
    blue: "from-blue-500/10 to-sky-500/5 text-blue-700",
    rose: "from-rose-500/10 to-pink-500/5 text-rose-700",
    slate: "from-slate-500/10 to-slate-400/5 text-slate-700",
  };
  return (
    <div className="bg-card rounded-2xl border border-border p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
          <p className="text-xl sm:text-3xl font-bold mt-2 font-heading break-words">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        {Icon && (
          <div className={cn("h-11 w-11 rounded-xl bg-gradient-to-br flex items-center justify-center", tones[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}