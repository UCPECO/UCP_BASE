import React from "react";
import { cn } from "@/lib/utils";
import { ESTADO_COLORS, PRIORIDAD_COLORS } from "@/lib/ucpUtils";

export default function StatusBadge({ status, type = "estado" }) {
  const colors = type === "prioridad" ? PRIORIDAD_COLORS : ESTADO_COLORS;
  const cls = colors[status] || "bg-slate-100 text-slate-600";
  const label = status?.replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize", cls)}>
      {label}
    </span>
  );
}