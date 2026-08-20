import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, LineChart, Line } from "recharts";
import { BarChart3, PieChart as PieIcon, GraduationCap, Users, AlertTriangle, Trophy, Leaf, TrendingUp } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import KpiCard from "@/components/ucp/KpiCard";
import EmptyState from "@/components/ucp/EmptyState";
import { calcularHoras, aMinutos, nombreUsuario } from "@/lib/ucpUtils";
import { esParticipante } from "@/lib/roles";
import { calcularHuella } from "@/lib/huellaCarbono";

const COLOR_PRIMARY = "#1f6f5c";
const COLOR_ACCENT = "#e08a3e";
const COLOR_ROSE = "#e2533f";

export default function AdminEstadisticas() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [users, regs, bonos, incs, evs, configs, asignaciones, acts, mats, elecs] = await Promise.all([
          base44.entities.User.list("full_name", 500),
          base44.entities.Registros_QR.list("-fecha", 500),
          base44.entities.Bonos.list("-created_date", 500),
          base44.entities.Incidencias.list("-created_date", 500),
          base44.entities.Evidencias.list("-created_date", 500),
          base44.entities.Configuracion_Sistema.list(null, 1).catch(() => []),
          base44.entities.Asignaciones.list("-created_date", 500),
          base44.entities.Actividades.list(null, 200),
          base44.entities.Materiales_Recibidos.list("-fecha_recepcion", 500),
          base44.entities.Electronicos_Reciclados.list("-fecha_recepcion", 500),
        ]);
        const config = configs?.[0] || {};
        const limitePuntual = aMinutos(config.hora_apertura || "08:00") + (config.tolerancia_minutos ?? 15);

        const alumnos = users.filter(u => esParticipante(u.role));

        // Horas validadas por usuario (solo fichajes validados + bonos)
        const horasPorUsuario = {};
        const porValidarPorUsuario = {};
        const regsCerradosPorUsuario = {};
        const puntualesPorUsuario = {};
        const mesActual = new Date().toISOString().slice(0, 7);
        const horasMesPorUsuario = {};
        regs.forEach(r => {
          if (!r.usuario || (r.estado_registro !== "cerrado" && r.estado_registro !== "incompleto")) return;
          const h = calcularHoras(r.hora_entrada, r.hora_salida) || 0;
          regsCerradosPorUsuario[r.usuario] = (regsCerradosPorUsuario[r.usuario] || 0) + 1;
          if (r.hora_entrada && aMinutos(r.hora_entrada) <= limitePuntual) {
            puntualesPorUsuario[r.usuario] = (puntualesPorUsuario[r.usuario] || 0) + 1;
          }
          if (r.validado) {
            horasPorUsuario[r.usuario] = (horasPorUsuario[r.usuario] || 0) + h;
            if ((r.fecha || "").startsWith(mesActual)) horasMesPorUsuario[r.usuario] = (horasMesPorUsuario[r.usuario] || 0) + h;
          } else {
            porValidarPorUsuario[r.usuario] = (porValidarPorUsuario[r.usuario] || 0) + h;
          }
        });
        bonos.forEach(b => {
          if (!b.usuario) return;
          horasPorUsuario[b.usuario] = (horasPorUsuario[b.usuario] || 0) + (b.horas || 0);
          if ((b.fecha || "").startsWith(mesActual)) horasMesPorUsuario[b.usuario] = (horasMesPorUsuario[b.usuario] || 0) + (b.horas || 0);
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
        const activos = alumnos.filter(u => u.activo !== false && !u.archivado);
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

        // Evidencias e incidencias por usuario
        const evsPorUsuario = {};
        const evsAprobPorUsuario = {};
        evs.forEach(e => {
          if (!e.usuario) return;
          evsPorUsuario[e.usuario] = (evsPorUsuario[e.usuario] || 0) + 1;
          if (e.estado_evidencia === "aprobada") evsAprobPorUsuario[e.usuario] = (evsAprobPorUsuario[e.usuario] || 0) + 1;
        });
        const incsPorUsuario = {};
        incs.forEach(i => { if (i.usuario_afectado) incsPorUsuario[i.usuario_afectado] = (incsPorUsuario[i.usuario_afectado] || 0) + 1; });

        // KPIs por persona
        const kpisPersona = alumnos.map(u => {
          const cerrados = regsCerradosPorUsuario[u.id] || 0;
          const totalEvs = evsPorUsuario[u.id] || 0;
          return {
            id: u.id,
            nombre: nombreUsuario(u),
            validadas: Math.round((horasPorUsuario[u.id] || 0) * 100) / 100,
            porValidar: Math.round((porValidarPorUsuario[u.id] || 0) * 100) / 100,
            puntualidad: cerrados ? Math.round(((puntualesPorUsuario[u.id] || 0) / cerrados) * 100) : null,
            evidencias: totalEvs ? Math.round(((evsAprobPorUsuario[u.id] || 0) / totalEvs) * 100) : null,
            incidencias: incsPorUsuario[u.id] || 0,
          };
        }).sort((a, b) => b.validadas - a.validadas);

        // Cuadro de honor: top 5 por horas del mes en curso
        const cuadroHonor = alumnos
          .map(u => ({ id: u.id, nombre: nombreUsuario(u), horasMes: Math.round((horasMesPorUsuario[u.id] || 0) * 100) / 100 }))
          .filter(x => x.horasMes > 0)
          .sort((a, b) => b.horasMes - a.horasMes)
          .slice(0, 5);

        // Top donantes: kg y CO2e evitado por empresa/persona (huella de carbono)
        const huella = calcularHuella(mats, elecs);
        const topDonantes = huella.empresas
          .filter(e => e.empresa !== "Sin nombre")
          .slice(0, 8)
          .map(e => ({ empresa: e.empresa.length > 22 ? e.empresa.slice(0, 21) + "…" : e.empresa, kg: e.kg, co2e: e.co2e }));

        // Progreso de cohorte: participantes activos según % de su meta de horas
        const metaPorUsuario = {};
        asignaciones.forEach(a => {
          if (!a.usuario) return;
          const act = acts.find(x => x.id === a.actividad);
          metaPorUsuario[a.usuario] = act?.meta_horas || 480;
        });
        const cohorteBuckets = [
          { rango: "< 25%", min: 0, max: 25, alumnos: 0 },
          { rango: "25–50%", min: 25, max: 50, alumnos: 0 },
          { rango: "50–75%", min: 50, max: 75, alumnos: 0 },
          { rango: "> 75%", min: 75, max: Infinity, alumnos: 0 },
        ];
        activos.forEach(u => {
          const meta = metaPorUsuario[u.id] || 480;
          const pct = ((horasPorUsuario[u.id] || 0) / meta) * 100;
          const bucket = cohorteBuckets.find(b => pct >= b.min && pct < b.max) || cohorteBuckets[0];
          bucket.alumnos += 1;
        });

        // Tendencia semanal: horas fichadas por semana (últimas 12)
        const porSemana = {};
        regs.forEach(r => {
          if (!r.fecha || (r.estado_registro !== "cerrado" && r.estado_registro !== "incompleto")) return;
          const d = new Date(r.fecha + "T00:00:00");
          if (isNaN(d)) return;
          const lunes = new Date(d);
          lunes.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes de esa semana
          const clave = lunes.toISOString().slice(0, 10);
          porSemana[clave] = (porSemana[clave] || 0) + (calcularHoras(r.hora_entrada, r.hora_salida) || 0);
        });
        const tendenciaSemanal = Object.entries(porSemana)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-12)
          .map(([semana, horas]) => ({
            semana: new Date(semana + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
            horas: Math.round(horas * 10) / 10,
          }));

        setData({
          totalAlumnos: alumnos.length,
          activos: activos.length,
          totalHoras: Math.round(Object.values(horasPorUsuario).reduce((a, b) => a + b, 0) * 100) / 100,
          totalPorValidar: Math.round(Object.values(porValidarPorUsuario).reduce((a, b) => a + b, 0) * 100) / 100,
          incidenciasAbiertas: incs.filter(i => ["reportada", "en_revision", "en_proceso"].includes(i.estado_incidencia)).length,
          horasFacultad,
          distribucion,
          kpisPersona,
          cuadroHonor,
          topDonantes,
          cohorte: cohorteBuckets,
          tendenciaSemanal,
          totalCo2e: huella.total_co2e,
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
        <SectionCard title="Horas acumuladas por facultad" subtitle="Suma de horas validadas y bonos" icon={BarChart3} className="lg:col-span-2">
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

      {/* Gráficas operativas: donantes, cohorte y tendencia */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Top donantes" subtitle={`Mayor CO2e evitado · total ${data.totalCo2e} kg`} icon={Leaf}>
          {data.topDonantes.length === 0 ? (
            <EmptyState title="Sin recepciones" message="Aún no hay materiales recibidos con empresa registrada." icon={Leaf} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topDonantes} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="empresa" width={130} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, name) => name === "co2e" ? `${v} kg CO2e` : `${v} kg`} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7e0" }} />
                <Bar dataKey="co2e" name="co2e" fill={COLOR_PRIMARY} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Progreso de la cohorte" subtitle="Participantes activos según % de su meta de horas" icon={Users}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.cohorte} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="rango" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v) => `${v} participantes`} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7e0" }} />
              <Bar dataKey="alumnos" name="Participantes" fill={COLOR_ACCENT} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>
      </div>

      <SectionCard title="Tendencia semanal de horas" subtitle="Horas fichadas por semana (últimas 12 semanas, desde el lunes)" icon={TrendingUp}>
        {data.tendenciaSemanal.length === 0 ? (
          <EmptyState title="Sin fichajes" message="Aún no hay registros cerrados para graficar." icon={TrendingUp} />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.tendenciaSemanal} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="semana" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${v} h`} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7e0" }} />
              <Line type="monotone" dataKey="horas" name="Horas" stroke={COLOR_PRIMARY} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      {/* Cuadro de honor del mes */}
      <SectionCard title="Cuadro de honor" subtitle="Top 5 por horas validadas en el mes en curso" icon={Trophy}>
        {data.cuadroHonor.length === 0 ? (
          <EmptyState title="Sin horas este mes" message="Aún no hay horas validadas en el mes en curso." icon={Trophy} />
        ) : (
          <div className="space-y-2">
            {data.cuadroHonor.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <span className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <p className="text-sm font-medium flex-1 min-w-0 truncate">{p.nombre}</p>
                <p className="text-sm font-bold text-primary shrink-0">{p.horasMes} h</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* KPIs por persona */}
      <SectionCard title={`Desempeño por persona (${data.kpisPersona.length})`} subtitle={`Horas validadas, puntualidad y evidencias · ${data.totalPorValidar} h pendientes de validar en total`} icon={Users}>
        {data.kpisPersona.length === 0 ? (
          <EmptyState title="Sin datos" message="No hay alumnos registrados." icon={Users} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 px-3 font-medium text-right">H. validadas</th>
                  <th className="py-2 px-3 font-medium text-right">Por validar</th>
                  <th className="py-2 px-3 font-medium text-right">Puntualidad</th>
                  <th className="py-2 px-3 font-medium text-right">Evidencias aprob.</th>
                  <th className="py-2 pl-3 font-medium text-right">Incidencias</th>
                </tr>
              </thead>
              <tbody>
                {data.kpisPersona.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{p.nombre}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-primary">{p.validadas} h</td>
                    <td className="py-2.5 px-3 text-right">{p.porValidar > 0 ? <span className="text-amber-600 font-medium">{p.porValidar} h</span> : "—"}</td>
                    <td className="py-2.5 px-3 text-right">{p.puntualidad === null ? "—" : `${p.puntualidad}%`}</td>
                    <td className="py-2.5 px-3 text-right">{p.evidencias === null ? "—" : `${p.evidencias}%`}</td>
                    <td className="py-2.5 pl-3 text-right">{p.incidencias > 0 ? <span className="text-rose-600 font-medium">{p.incidencias}</span> : "0"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}