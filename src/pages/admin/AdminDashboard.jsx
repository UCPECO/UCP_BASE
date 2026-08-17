import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, GraduationCap, Heart, CheckCircle2, Clock, Image, AlertTriangle, CalendarX } from "lucide-react";
import KpiCard from "@/components/ucp/KpiCard";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatearFecha } from "@/lib/ucpUtils";
import GestionRoles from "@/components/ucp/GestionRoles";
import FiltrosAlumnosAdmin from "@/components/ucp/FiltrosAlumnosAdmin";

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [recientes, setRecientes] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [users, asigs, regs, evs, incs, horarios] = await Promise.all([
          base44.entities.User.list("full_name", 500),
          base44.entities.Asignaciones.list("-created_date", 500),
          base44.entities.Registros_QR.list("-fecha", 500),
          base44.entities.Evidencias.list("-created_date", 500),
          base44.entities.Incidencias.list("-created_date", 500),
          base44.entities.Horarios_Clase.list("dia_semana", 500),
        ]);
        const alumnos = users.filter(u => u.role === "servicio_social" || u.role === "voluntario");
        const activos = alumnos.filter(u => u.activo !== false);
        const hoy = new Date().toISOString().split("T")[0];
        const userIdsConHorario = new Set(horarios.map(h => h.usuario));
        setStats({
          total: activos.length,
          servicio: activos.filter(u => u.tipo_participante === "servicio_social").length,
          voluntarios: activos.filter(u => u.tipo_participante === "voluntario").length,
          completados: asigs.filter(a => a.estado === "completado").length,
          registrosHoy: regs.filter(r => r.estado_registro === "abierto" && r.fecha === hoy).length,
          evidenciasPend: evs.filter(e => e.estado_evidencia === "pendiente").length,
          incidenciasPend: incs.filter(i => ["reportada", "en_revision", "en_proceso"].includes(i.estado_incidencia)).length,
          sinHorario: activos.filter(u => !userIdsConHorario.has(u.id)).length,
        });
        setRecientes(regs.slice(0, 5));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Panel de administración</p>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">Dashboard</h1>
        </div>
        <Link to="/admin/alumnos"><Button variant="outline">Ver alumnos</Button></Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Alumnos activos" value={stats.total} tone="primary" />
        <KpiCard icon={GraduationCap} label="Servicio social" value={stats.servicio} tone="blue" />
        <KpiCard icon={Heart} label="Voluntarios" value={stats.voluntarios} tone="accent" />
        <KpiCard icon={CheckCircle2} label="Completados" value={stats.completados} tone="primary" />
        <KpiCard icon={Clock} label="Registros abiertos hoy" value={stats.registrosHoy} tone="accent" />
        <KpiCard icon={Image} label="Evidencias pendientes" value={stats.evidenciasPend} tone="blue" />
        <KpiCard icon={AlertTriangle} label="Incidencias pendientes" value={stats.incidenciasPend} tone="rose" />
        <KpiCard icon={CalendarX} label="Alumnos sin horario" value={stats.sinHorario} tone="slate" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GestionRoles />
        <SectionCard title="Fichajes recientes" subtitle="Últimos registros del sistema">
          {recientes.length === 0 ? (
            <EmptyState title="Sin registros" message="No hay fichajes registrados." icon={Clock} />
          ) : (
            <div className="space-y-2">
              {recientes.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{formatearFecha(r.fecha)}</p>
                    <p className="text-xs text-muted-foreground">Entrada: {r.hora_entrada} · Salida: {r.hora_salida || "—"}</p>
                  </div>
                  <StatusBadge status={r.estado_registro} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <FiltrosAlumnosAdmin />
    </div>
  );
}