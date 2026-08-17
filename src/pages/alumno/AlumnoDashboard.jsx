import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useAlumnoData } from "@/lib/useAlumnoData";
import { Link } from "react-router-dom";
import { Clock, Award, TrendingUp, Calendar, QrCode, History, Sparkles } from "lucide-react";
import KpiCard from "@/components/ucp/KpiCard";
import ProgressBar from "@/components/ucp/ProgressBar";
import SectionCard from "@/components/ucp/SectionCard";
import StatusBadge from "@/components/ucp/StatusBadge";
import EmptyState from "@/components/ucp/EmptyState";
import { formatearFecha } from "@/lib/ucpUtils";
import { Button } from "@/components/ui/button";
import CalendarioAlumno from "@/components/ucp/CalendarioAlumno";
import EventosGoogleCalendar from "@/components/ucp/EventosGoogleCalendar";
import PaseListaAlumno from "@/components/ucp/PaseListaAlumno";

export default function AlumnoDashboard() {
  const { loading, perfil, asignacion, actividad, registros, totalHoras, horasAcumuladas, horasBono, meta, porcentaje, restantes, horario, eventos } = useAlumnoData();
  const [registroAbierto, setRegistroAbierto] = useState(null);

  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setRegistroAbierto(registros.find(r => r.estado_registro === "abierto") || null);
  }, [registros]);

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {perfil?.foto_perfil ? (
          <img src={perfil.foto_perfil} alt="perfil" className="h-14 w-14 rounded-full object-cover border-2 border-border shrink-0" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-lg shrink-0">
            {(perfil?.nombre_completo || perfil?.full_name || "?").charAt(0)}
          </div>
        )}
        <div>
          <p className="text-sm text-muted-foreground">Bienvenido de vuelta</p>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">{perfil?.nombre_completo || perfil?.full_name || "Alumno"}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{perfil?.tipo_participante?.replace(/_/g, " ") || "—"} · {actividad?.nombre || "Sin asignación"}</p>
        </div>
      </div>

      {/* Progreso al inicio */}
      <SectionCard title="Mi progreso hacia la meta" subtitle={`Meta: ${meta} hrs · ${actividad?.nombre || "Sin actividad"}`}>
        <ProgressBar value={totalHoras} max={meta} label="Avance general" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          <InfoMini label="Acumulado" value={`${totalHoras} h`} />
          <InfoMini label="Completado" value={`${porcentaje}%`} />
          <InfoMini label="Restantes" value={`${restantes} h`} />
          <InfoMini label="Estado" value={<StatusBadge status={asignacion?.estado} />} />
        </div>
      </SectionCard>

      {/* Pase de lista activo */}
      <PaseListaAlumno />

      {/* CTA Fichar */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 h-32 w-32 bg-white/10 rounded-full -mr-12 -mt-12" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-emerald-100 text-sm font-medium">{registroAbierto ? "Tienes un registro abierto" : "Registra tu entrada"}</p>
            <h2 className="text-xl font-bold font-heading mt-1">{registroAbierto ? "No olvides marcar tu salida" : "Escanea el QR para fichar"}</h2>
            <p className="text-emerald-100 text-sm mt-1">{registroAbierto ? `Entrada: ${registroAbierto.hora_entrada}` : "Registra tu asistencia con la cámara"}</p>
          </div>
          <Link to="/fichar">
            <Button className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold shadow-md">
              <QrCode className="h-4 w-4 mr-2" /> Fichar ahora
            </Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Clock} label="Horas acumuladas" value={horasAcumuladas} hint="por registros QR" tone="primary" />
        <KpiCard icon={Sparkles} label="Horas bono" value={horasBono} hint="extra asignadas" tone="accent" />
        <KpiCard icon={TrendingUp} label="Total horas" value={totalHoras} hint={`Meta: ${meta} hrs`} tone="blue" />
        <KpiCard icon={Award} label="Restantes" value={restantes} hint={`${porcentaje}% completado`} tone="rose" />
      </div>

      {/* Historial QR */}
      <SectionCard title="Historial de fichajes" subtitle="Tus registros QR recientes" icon={History}>
        {registros.length === 0 ? (
          <EmptyState title="Sin fichajes aún" message="Escanea el QR de UCP para registrar tu primera entrada." icon={QrCode} />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Entrada</th>
                  <th className="py-2 pr-4 font-medium">Salida</th>
                  <th className="py-2 pr-4 font-medium">Horas</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {registros.slice(0, 8).map((r) => {
                  const hrs = r.hora_salida ? (calcularHorasLocal(r.hora_entrada, r.hora_salida)) : 0;
                  return (
                    <tr key={r.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4">{formatearFecha(r.fecha)}</td>
                      <td className="py-3 pr-4">{r.hora_entrada}</td>
                      <td className="py-3 pr-4">{r.hora_salida || "—"}</td>
                      <td className="py-3 pr-4 font-medium">{r.estado_registro === "cerrado" ? `${hrs}h` : "—"}</td>
                      <td className="py-3"><StatusBadge status={r.estado_registro} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Calendario */}
      <CalendarioAlumno horarios={horario} eventos={eventos} />

      {/* Calendario Google sincronizado */}
      <EventosGoogleCalendar />
    </div>
  );
}

function calcularHorasLocal(entrada, salida) {
  if (!entrada || !salida) return 0;
  const [h1, m1] = entrada.split(":").map(Number);
  const [h2, m2] = salida.split(":").map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 100) / 100;
}

function InfoMini({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
    </div>
  );
}