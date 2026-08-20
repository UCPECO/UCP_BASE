import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import useRecargarAlVolver from "@/hooks/useRecargarAlVolver";
import { useEncargadoData } from "@/lib/useEncargadoData";
import { Users, ClipboardCheck, Image, AlertTriangle, Clock, TrendingUp, UserX } from "lucide-react";
import KpiCard from "@/components/ucp/KpiCard";
import SectionCard from "@/components/ucp/SectionCard";
import ProgressBar from "@/components/ucp/ProgressBar";
import EmptyState from "@/components/ucp/EmptyState";
import { sumarHorasRegistros, sumarHorasBonos, calcularPorcentaje, nombreUsuario, formatearFecha } from "@/lib/ucpUtils";
import { labelArea } from "@/lib/areas";
import KanbanEvidencias from "@/components/ucp/KanbanEvidencias";

export default function EncargadoDashboard() {
  const { loading, perfil, misActividades, alumnos, asignaciones } = useEncargadoData();
  const [registrosAbiertos, setRegistrosAbiertos] = useState(0);
  const [evidenciasPend, setEvidenciasPend] = useState(0);
  const [progresos, setProgresos] = useState([]);
  const [inactivos, setInactivos] = useState([]);

  const cargar = async () => {
    try {
      const regs = await base44.entities.Registros_QR.list("-fecha", 200);
      const asignIds = new Set(asignaciones.map(a => a.id));
      setRegistrosAbiertos(regs.filter(r => r.estado_registro === "abierto" && asignIds.has(r.asignacion)).length);
      const evs = await base44.entities.Evidencias.list("-created_date", 200);
      setEvidenciasPend(evs.filter(e => e.estado_evidencia === "pendiente" && asignIds.has(e.asignacion)).length);
      // progresos por alumno
      const regsByUser = {};
      regs.forEach(r => { (regsByUser[r.usuario] = regsByUser[r.usuario] || []).push(r); });
      const bonos = await base44.entities.Bonos.list("-fecha", 200);
      const bonosByUser = {};
      bonos.forEach(b => { (bonosByUser[b.usuario] = bonosByUser[b.usuario] || []).push(b); });
      const prog = asignaciones.map(a => {
        const hrsReg = sumarHorasRegistros(regsByUser[a.usuario] || []);
        const hrsBono = sumarHorasBonos(bonosByUser[a.usuario] || []);
        const total = Math.round((hrsReg + hrsBono) * 100) / 100;
        const act = misActividades.find(x => x.id === a.actividad);
        return { asignacion: a, alumno: alumnos.find(u => u.id === a.usuario), total, meta: act?.meta_horas || 480 };
      });
      setProgresos(prog);

      // Alertas de inactividad: mis alumnos sin fichar en más de 7 días (o nunca)
      const ultimoFichaje = {};
      regs.forEach(r => { if (!ultimoFichaje[r.usuario]) ultimoFichaje[r.usuario] = r.fecha; });
      const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      setInactivos(alumnos
        .filter(u => !u.archivado)
        .map(u => ({ user: u, ultima: ultimoFichaje[u.id] || null }))
        .filter(x => !x.ultima || x.ultima < hace7)
        .slice(0, 10));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { cargar(); }, [asignaciones, alumnos, misActividades]);
  useRecargarAlVolver(cargar);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Panel del encargado</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">{nombreUsuario(perfil)}</h1>
        <p className="text-sm text-muted-foreground mt-1">{misActividades.length} actividad(es) a cargo</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Alumnos activos" value={alumnos.length} tone="primary" />
        <KpiCard icon={ClipboardCheck} label="Registros abiertos" value={registrosAbiertos} tone="accent" />
        <KpiCard icon={Image} label="Evidencias pendientes" value={evidenciasPend} tone="blue" />
        <KpiCard icon={TrendingUp} label="Asignaciones" value={asignaciones.length} tone="slate" />
      </div>

      <SectionCard title="Mis actividades" subtitle="Áreas bajo tu responsabilidad">
        {misActividades.length === 0 ? (
          <EmptyState title="Sin actividades asignadas" message="Contacta al admin para que te asigne actividades." icon={AlertTriangle} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {misActividades.map((a) => (
              <div key={a.id} className="p-4 rounded-xl border border-border bg-muted/30">
                <p className="font-semibold text-sm">{a.nombre}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{labelArea(a.categoria)}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Progreso de mis alumnos" subtitle="Horas acumuladas por asignación">
        {progresos.length === 0 ? (
          <EmptyState title="Sin alumnos" message="No tienes alumnos asignados aún." icon={Users} />
        ) : (
          <div className="space-y-4">
            {progresos.map((p) => (
              <div key={p.asignacion.id} className="flex items-center gap-4">
                <div className="w-32 shrink-0">
                  <p className="text-sm font-medium truncate">{nombreUsuario(p.alumno)}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.asignacion.estado}</p>
                </div>
                <div className="flex-1"><ProgressBar value={p.total} max={p.meta} showNumbers /></div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <KanbanEvidencias />

      {inactivos.length > 0 && (
        <SectionCard title={`Sin actividad reciente (${inactivos.length})`} subtitle="Tus alumnos sin fichar en más de 7 días" icon={UserX}>
          <div className="space-y-2">
            {inactivos.map(({ user: u, ultima }) => (
              <div key={u.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <p className="text-sm font-medium truncate">{nombreUsuario(u)}</p>
                <p className="text-xs text-muted-foreground shrink-0">
                  {ultima ? `Último fichaje: ${formatearFecha(ultima)}` : "Nunca ha fichado"}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}