import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardCheck, Loader2, Star, Search } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Input } from "@/components/ui/input";
import { formatearFecha } from "@/lib/ucpUtils";
import { labelArea } from "@/lib/areas";

const DIM_LABELS = {
  puntualidad: "Puntualidad",
  actitud: "Actitud",
  calidad_trabajo: "Calidad",
  cumplimiento: "Cumplimiento",
  iniciativa: "Iniciativa",
};

export default function AdminEvaluaciones() {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroArea, setFiltroArea] = useState("");

  useEffect(() => {
    base44.entities.Evaluaciones_Alumno.list("-created_date", 500).then((data) => {
      setEvaluaciones(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const promedio = (e) => (Number(e.puntualidad) + Number(e.actitud) + Number(e.calidad_trabajo) + Number(e.cumplimiento) + Number(e.iniciativa)) / 5;

  const filtradas = evaluaciones.filter((e) => {
    const txt = (e.usuario_nombre + " " + (e.area || "") + " " + (e.periodo || "")).toLowerCase();
    return txt.includes(busqueda.toLowerCase()) && (!filtroArea || e.area === filtroArea);
  });

  const areas = ["Bodega", "Recolección de Pilas", "Redes Sociales", "Presentación y Relaciones"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-primary" /> Evaluaciones
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Todas las evaluaciones de desempeño del sistema.</p>
      </div>

      <SectionCard title="Evaluaciones registradas" subtitle={filtradas.length + " registros"}
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 w-40" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
              <option value="">Todas áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
        ) : filtradas.length === 0 ? (
          <EmptyState title="Sin evaluaciones" message="No hay evaluaciones que coincidan con el filtro." icon={Star} />
        ) : (
          <>
          {/* Móvil: tarjetas apiladas */}
          <div className="md:hidden space-y-3">
            {filtradas.map((e) => (
              <div key={e.id} className="p-3 rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium truncate">{e.usuario_nombre}</p>
                  <span className="font-semibold text-primary shrink-0">{promedio(e).toFixed(1)} ★</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{labelArea(e.area)} · {e.evaluado_por_nombre || "—"} · {formatearFecha(e.fecha)}</p>
                <div className="grid grid-cols-5 gap-1 mt-2 text-center">
                  <div><p className="text-sm">{e.puntualidad}</p><p className="text-[10px] text-muted-foreground">Punt.</p></div>
                  <div><p className="text-sm">{e.actitud}</p><p className="text-[10px] text-muted-foreground">Act.</p></div>
                  <div><p className="text-sm">{e.calidad_trabajo}</p><p className="text-[10px] text-muted-foreground">Cal.</p></div>
                  <div><p className="text-sm">{e.cumplimiento}</p><p className="text-[10px] text-muted-foreground">Cump.</p></div>
                  <div><p className="text-sm">{e.iniciativa}</p><p className="text-[10px] text-muted-foreground">Inic.</p></div>
                </div>
              </div>
            ))}
          </div>
          {/* Escritorio: tabla */}
          <div className="overflow-x-auto scrollbar-thin hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase border-b border-border">
                  <th className="py-2 pr-3 font-medium">Alumno</th>
                  <th className="py-2 px-3 font-medium">Área</th>
                  <th className="py-2 px-3 font-medium">Evaluador</th>
                  <th className="py-2 px-3 font-medium">Punt.</th>
                  <th className="py-2 px-3 font-medium">Act.</th>
                  <th className="py-2 px-3 font-medium">Cal.</th>
                  <th className="py-2 px-3 font-medium">Cump.</th>
                  <th className="py-2 px-3 font-medium">Inic.</th>
                  <th className="py-2 px-3 font-medium">Prom.</th>
                  <th className="py-2 pl-3 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-3 font-medium">{e.usuario_nombre}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{labelArea(e.area)}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{e.evaluado_por_nombre || "—"}</td>
                    <td className="py-2.5 px-3">{e.puntualidad}</td>
                    <td className="py-2.5 px-3">{e.actitud}</td>
                    <td className="py-2.5 px-3">{e.calidad_trabajo}</td>
                    <td className="py-2.5 px-3">{e.cumplimiento}</td>
                    <td className="py-2.5 px-3">{e.iniciativa}</td>
                    <td className="py-2.5 px-3"><span className="font-semibold text-primary">{promedio(e).toFixed(1)}</span></td>
                    <td className="py-2.5 pl-3 text-muted-foreground">{formatearFecha(e.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}