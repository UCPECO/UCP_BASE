import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import useRecargarAlVolver from "@/hooks/useRecargarAlVolver";
import { Users, GraduationCap, Heart, CheckCircle2, Clock, Image, AlertTriangle, CalendarX, UserX } from "lucide-react";
import KpiCard from "@/components/ucp/KpiCard";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatearFecha } from "@/lib/ucpUtils";
import GestionRoles from "@/components/ucp/GestionRoles";
import FiltrosAlumnosAdmin from "@/components/ucp/FiltrosAlumnosAdmin";
import { esParticipante } from "@/lib/roles";

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [recientes, setRecientes] = useState([]);
  const [inactivos, setInactivos] = useState([]);

  const cargar = async () => {
    try {
      const [users, asigs, regs, evs, incs, horarios] = await Promise.all([
        base44.entities.User.list("full_name", 500),
        base44.entities.Asignaciones.list("-created_date", 500),
        base44.entities.Registros_QR.list("-fecha", 500),
        base44.entities.Evidencias.list("-created_date", 500),
        base44.entities.Incidencias.list("-created_date", 500),
        base44.entities.Horarios_Clase.list("dia_semana", 500),
      ]);
      const alumnos = users.filter(u => esParticipante(u.role));
      const activos = alumnos.filter(u => u.activo !== false && !u.archivado);
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

      // Alertas de inactividad: participantes activos sin fichar en más de 7 días (o nunca)
      const ultimoFichaje = {};
      regs.forEach(r => { if (!ultimoFichaje[r.usuario]) ultimoFichaje[r.usuario] = r.fecha; });
      const hace7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      setInactivos(activos
        .map(u => ({ user: u, ultima: ultimoFichaje[u.id] || null }))
        .filter(x => !x.ultima || x.ultima < hace7)
        .sort((a, b) => (a.ultima || "0000") < (b.ultima || "0000") ? -1 : 1)
        .slice(0, 10));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);
  useRecargarAlVolver(cargar);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Panel de administración</p>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">Dashboard</h1>
        </div>
        <Link to="/admin/personal"><Button variant="outline">Ver alumnos</Button></Link>
      </div>

      {/* Primero lo que requiere acción; cada tarjeta es un atajo a su sección */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={Clock} label="Registros abiertos hoy" value={stats.registrosHoy} tone="accent" to="/admin/registros" />
        <KpiCard icon={Image} label="Evidencias pendientes" value={stats.evidenciasPend} tone="blue" to="/admin/evidencias" />
        <KpiCard icon={AlertTriangle} label="Incidencias pendientes" value={stats.incidenciasPend} tone="rose" to="/admin/incidencias" />
        <KpiCard icon={CalendarX} label="Sin horario" value={stats.sinHorario} tone="slate" to="/admin/personal" />
        <KpiCard icon={Users} label="Alumnos activos" value={stats.total} tone="primary" to="/admin/personal" />
        <KpiCard icon={GraduationCap} label="Servicio social" value={stats.servicio} tone="blue" to="/admin/personal" />
        <KpiCard icon={Heart} label="Voluntarios" value={stats.voluntarios} tone="accent" to="/admin/personal" />
        <KpiCard icon={CheckCircle2} label="Completados" value={stats.completados} tone="primary" to="/admin/estadisticas" />
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

      {inactivos.length > 0 && (
        <SectionCard title={`Sin actividad reciente (${inactivos.length})`} subtitle="Participantes activos sin fichar en más de 7 días" icon={UserX}>
          <div className="space-y-2">
            {inactivos.map(({ user: u, ultima }) => (
              <div key={u.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.nombre_completo || u.full_name || u.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {ultima ? `Último fichaje: ${formatearFecha(ultima)}` : "Nunca ha fichado"}
                  </p>
                </div>
                <Link to="/admin/personal"><Button size="sm" variant="outline">Revisar</Button></Link>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <FiltrosAlumnosAdmin />
    </div>
  );
}