import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";
import { BarChart3, PieChart as PieIcon, GraduationCap, Users, AlertTriangle } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import KpiCard from "@/components/ucp/KpiCard";
import EmptyState from "@/components/ucp/EmptyState";
import { calcularHoras } from "@/lib/ucpUtils";

const COLOR_PRIMARY = "#1f6f5c";
const COLOR_ACCENT = "#e08a3e";
const COLOR_ROSE = "#e2533f";

export default function AdminEstadisticas() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [users, regs, bonos, incs] = await Promise.all([
          base44.entities.User.list("full_name", 500),
          base44.entities.Registros_QR.list("-fecha", 500),
          base44.entities.Bonos.list("-created_date", 500),
          base44.entities.Incidencias.list("-created_date", 500),
        ]);

        const alumnos = users.filter(u => u.role === "servicio_social" || u.role === "voluntario");

        // Horas por usuario
        const horasPorUsuario = {};
        regs.forEach(r => {
          if (r.estado_registro === "cerrado" && r.usuario) {
            horasPorUsuario[r.usuario] = (horasPorUsuario[r.usuario] || 0) + (calcularHoras(r.hora_entrada, r.hora_salida) || 0);
          }
        });
        bonos.forEach(b => {
          if (b.usuario) horasPorUsuario[b.usuario] = (horasPorUsuario[b.usuario] || 0) + (b.horas || 0);
        });

        // Horas acumuladas por facultad
        const porFacultad = {};
        alumnos.forEach(u => {
          const fac = u.facultad || "Sin facultad";
          porFacultad[fac] = (porFacultad[fac] || 0) + (horasPorUsuario[u.id] || 0);
        });
        const horasFacultad = Object.entries(porFacultad)
          .map(([facultad, horas]) => ({ facultad, horas: Math.round(horas * 100) / 100 }))
          .sort((a, b) => b.horas - a.horas);

        // Distribución: activos vs con incidencias
        const activos = alumnos.filter(u => u.activo !== false);
        const idsConIncidencia = new Set(
          incs.filter(i => ["reportada", "en_revision", "en_proceso", "resuelta"].includes(i.estado_incidencia))
            .map(i => i.usuario_afectado)
            .filter(Boolean)
        );
        const conIncidencias = activos.filter(u => idsConIncidencia.has(u.id)).length;
        const sinIncidencias = activos.length - conIncidencias;
        const distribucion = [
          { name: "Activos sin incidencias", value: sinIncidencias, color: COLOR_PRIMARY },
          { name: "Con incidencias", value: conIncidencias, color: COLOR_ROSE },
        ];

        setData({
          totalAlumnos: alumnos.length,
          activos: activos.length,
          totalHoras: Math.round(Object.values(horasPorUsuario).reduce((a, b) => a + b, 0) * 100) / 100,
          incidenciasAbiertas: incs.filter(i => ["reportada", "en_revision", "en_proceso"].includes(i.estado_incidencia)).length,
          horasFacultad,
          distribucion,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;
  if (!data) return <EmptyState title="Sin datos" message="No se pudieron cargar las estadísticas." />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Panel de administración</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">Estadísticas generales</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Users} label="Alumnos totales" value={data.totalAlumnos} tone="primary" />
        <KpiCard icon={GraduationCap} label="Alumnos activos" value={data.activos} tone="blue" />
        <KpiCard icon={BarChart3} label="Horas acumuladas" value={`${data.totalHoras}h`} tone="accent" />
        <KpiCard icon={AlertTriangle} label="Incidencias abiertas" value={data.incidenciasAbiertas} tone="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Horas acumuladas por facultad" subtitle="Suma de horas cerradas y bonos" icon={BarChart3} className="lg:col-span-2">
          {data.horasFacultad.length === 0 ? (
            <EmptyState title="Sin datos" message="Aún no hay horas registradas por facultad." icon={BarChart3} />
          ) : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={data.horasFacultad} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="facultad" angle={-30} textAnchor="end" interval={0} height={60} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v}h`} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7e0" }} />
                <Bar dataKey="horas" name="Horas" fill={COLOR_PRIMARY} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Alumnos activos vs con incidencias" subtitle="Distribución de alumnos activos" icon={PieIcon}>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie data={data.distribucion} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                {data.distribucion.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${v} alumnos`} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7e0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>
    </div>
  );
}