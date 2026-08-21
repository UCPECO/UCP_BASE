import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useEncargadoData } from "@/lib/useEncargadoData";
import { Users, Search } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import ProgressBar from "@/components/ucp/ProgressBar";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Input } from "@/components/ui/input";
import { sumarHorasRegistros, sumarHorasBonos } from "@/lib/ucpUtils";

export default function EncargadoAlumnos() {
  const { loading, alumnos, asignaciones, misActividades } = useEncargadoData();
  const [search, setSearch] = useState("");
  const [progresos, setProgresos] = useState({});

  useEffect(() => {
    (async () => {
      const regs = await base44.entities.Registros_QR.list("-fecha", 500);
      const bonos = await base44.entities.Bonos.list("-fecha", 500);
      const prog = {};
      asignaciones.forEach(a => {
        const hrsReg = sumarHorasRegistros(regs.filter(r => r.usuario === a.usuario));
        const hrsBono = sumarHorasBonos(bonos.filter(b => b.usuario === a.usuario));
        const act = misActividades.find(x => x.id === a.actividad);
        prog[a.usuario] = { total: Math.round((hrsReg + hrsBono) * 100) / 100, meta: 480, estado: a.estado, actividad: act?.nombre };
      });
      setProgresos(prog);
    })();
  }, [asignaciones, misActividades]);

  const filtered = alumnos.filter(a =>
    !search || (a.nombre_completo || a.full_name || "").toLowerCase().includes(search.toLowerCase()) || (a.matricula || "").includes(search)
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Mis alumnos</h1>
        <p className="text-sm text-muted-foreground mt-1">{alumnos.length} alumno(s) en tus actividades</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre o matrícula..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {filtered.length === 0 ? (
        <SectionCard><EmptyState title="Sin alumnos" message="No tienes alumnos asignados a tus actividades." icon={Users} /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((a) => {
            const p = progresos[a.id] || {};
            return (
              <div key={a.id} className="bg-card rounded-2xl border border-border shadow-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
                    {(a.nombre_completo || a.full_name || "?").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{a.nombre_completo || a.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{a.tipo_participante?.replace(/_/g, " ")} · {a.matricula || "Sin matrícula"}</p>
                  </div>
                  <StatusBadge status={p.estado || "activo"} />
                </div>
                <ProgressBar value={p.total || 0} max={p.meta || 480} label={p.actividad || "—"} />
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <Info label="Carrera" value={a.carrera || "—"} />
                  <Info label="Semestre" value={a.semestre || "—"} />
                  <Info label="Teléfono" value={a.telefono || "—"} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }) {
  return <div><p className="text-muted-foreground">{label}</p><p className="font-medium truncate">{value}</p></div>;
}