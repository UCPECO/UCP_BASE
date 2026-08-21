import React from "react";
import { cn } from "@/lib/utils";

// Bloque base con shimmer. Reemplaza spinners: la app se siente más rápida
// porque la forma del contenido ya se insinúa mientras carga.
export function Skeleton({ className }) {
  return <div className={cn("skeleton", className)} />;
}

// Esqueleto del dashboard del alumno: cabecera, progreso, CTA, KPIs y lista.
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-14 w-14 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
      <div className="bg-card rounded-2xl border border-border p-5 flex flex-col sm:flex-row items-center gap-6">
        <Skeleton className="h-40 w-40 rounded-full shrink-0" />
        <div className="flex-1 w-full space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    </div>
  );
}

// Esqueleto genérico de lista (fichajes, evidencias, etc.)
export function ListaSkeleton({ filas = 4 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[...Array(filas)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
