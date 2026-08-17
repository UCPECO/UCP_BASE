import React from "react";
import { cn } from "@/lib/utils";

export default function ProgressBar({ value = 0, max = 480, label, showNumbers = true }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct >= 100 ? "bg-emerald-500" : pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : pct >= 25 ? "bg-orange-400" : "bg-rose-400";
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs mb-1.5">
          <span className="font-medium text-muted-foreground">{label}</span>
          {showNumbers && <span className="font-semibold text-foreground">{value} / {max} hrs ({pct}%)</span>}
        </div>
      )}
      <div className="h-2.5 w-full bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700 ease-out", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}