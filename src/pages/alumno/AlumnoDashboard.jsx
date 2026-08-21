import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useAlumnoData } from "@/lib/useAlumnoData";
import { Link } from "react-router-dom";
import { Clock, Award, TrendingUp, Calendar, QrCode, History, Sparkles } from "lucide-react";
import KpiCard from "@/components/ucp/KpiCard";
import AnilloProgreso from "@/components/ucp/AnilloProgreso";
import NumeroAnimado from "@/components/ucp/NumeroAnimado";
import RachaFichajes from "@/components/ucp/RachaFichajes";
import HeatmapAsistencia from "@/components/ucp/HeatmapAsistencia";
import { DashboardSkeleton } from "@/components/ucp/Skeleton";
import SectionCard from "@/components/ucp/SectionCard";
import StatusBadge from "@/components/ucp/StatusBadge";
import EmptyState from "@/components/ucp/EmptyState";
import { formatearFecha } from "@/lib/ucpUtils";
import { Button } from "@/components/ui/button";
import CalendarioAlumno from "@/components/ucp/CalendarioAlumno";
import EventosGoogleCalendar from "@/components/ucp/EventosGoogleCalendar";
import PaseListaAlumno from "@/components/ucp/PaseListaAlumno";

export default function AlumnoDashboard() {
  const { loading, perfil, asignacion, actividad, registros, totalHoras, horasAcumuladas, horasPorValidar, horasBono, meta, porcentaje, restantes, horario, eventos } = useAlumnoData();
  const [registroAbierto, setRegistroAbierto] = useState(null);

  useEffect(() => {
    const hoy = new Date().toISOString().split("T")[0];
    setRegistroAbierto(registros.find(r => r.estado_registro === "abierto") || null);
  }, [registros]);

  if (loading) return <DashboardSkeleton />;

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
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">Bienvenido de vuelta</p>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">{perfil?.nombre_completo || perfil?.full_name || "Alumno"}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{perfil?.tipo_participante?.replace(/_/g, " ") || "—"} · {actividad?.nombre || "Sin asignación"}</p>
        </div>
        <img src="/branding/mascota-saludo.png" alt="" aria-hidden="true" className="hidden sm:block h-20 w-20 object-contain shrink-0" />
      </div>

      {/* Progreso al inicio: anillo protagonista + cifras grandes */}
      <SectionCard title="Mi progreso hacia la meta" subtitle={`Meta: ${meta} hrs · ${actividad?.nombre || "Sin actividad"}`}>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <AnilloProgreso value={totalHoras} max={meta} />
          <div className="flex-1 w-full text-center sm:text-left">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Horas acumuladas</p>
            <p className="font-heading font-extrabold text-4xl sm:text-5xl leading-none mt-2">
              <NumeroAnimado value={totalHoras} decimals={totalHoras % 1 ? 1 : 0} />
              <span className="text-lg sm:text-xl font-bold text-muted-foreground"> / {meta} h</span>
            </p>
            <div className="grid grid-cols-3 gap-4 mt-6 text-left">
              <InfoMini label="Restantes" value={`${restantes} h`} />
              <InfoMini label="Completado" value={`${porcentaje}%`} />
              <InfoMini label="Estado" value={<StatusBadge status={asignacion?.estado} />} />
            </div>
          </div>
        </div>
        {horasPorValidar > 0 && (
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Tienes <strong>{horasPorValidar} h</strong> pendientes de validación por tu encargado. Solo las horas validadas cuentan para tu meta.
          </p>
        )}
      </SectionCard>

      {/* Pase de lista activo */}
      <PaseListaAlumno />

      {/* CTA Fichar */}
      <div className="bg-gradient-to-br from-[#884ef4] to-[#3b488c] rounded-2xl p-6 text-white shadow-lg relative overflow-hidden glow-aurora">
        <div className="absolute right-0 top-0 h-32 w-32 bg-white/10 rounded-full -mr-12 -mt-12" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-white/70 text-sm font-medium">{registroAbierto ? "Tienes un registro abierto" : "Registra tu entrada"}</p>
            <h2 className="text-xl font-bold font-heading mt-1">{registroAbierto ? "No olvides marcar tu salida" : "Escanea el QR para fichar"}</h2>
            <p className="text-white/70 text-sm mt-1">{registroAbierto ? `Entrada: ${registroAbierto.hora_entrada}` : "Registra tu asistencia con la cámara"}</p>
          </div>
          <Link to="/fichar">
            <Button className="bg-white text-violet-700 hover:bg-violet-50 font-semibold shadow-md">
              <QrCode className="h-4 w-4 mr-2" /> Fichar ahora
            </Button>
          </Link>
        </div>
      </div>

      {/* Racha de asistencia */}
      <RachaFichajes registros={registros} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Clock} label="Horas acumuladas" value={horasAcumuladas} hint="por registros QR" tone="primary" />
        <KpiCard icon={Sparkles} label="Horas bono" value={horasBono} hint="extra asignadas" tone="accent" />
        <KpiCard icon={TrendingUp} label="Total horas" value={totalHoras} hint={`Meta: ${meta} hrs`} tone="blue" />
        <KpiCard icon={Award} label="Restantes" value={restantes} hint={`${porcentaje}% completado`} tone="rose" />
      </div>

      {/* Heatmap de constancia */}
      <SectionCard title="Tu constancia" subtitle="Mapa de asistencia de las últimas semanas" icon={Calendar}>
        <HeatmapAsistencia registros={registros} />
      </SectionCard>

      {/* Historial QR */}
      <SectionCard title="Historial de fichajes" subtitle="Tus registros QR recientes" icon={History}>
        {registros.length === 0 ? (
          <EmptyState title="Sin fichajes aún" message="Escanea el QR de UCP para registrar tu primera entrada." icon={QrCode} />
        ) : (
          /* Lista de filas (no tabla): se adapta sola a cualquier pantalla */
          <div className="divide-y divide-border/60">
            {registros.slice(0, 8).map((r) => {
              const hrs = r.hora_salida ? (calcularHorasLocal(r.hora_entrada, r.hora_salida)) : 0;
              return (
                <div key={r.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm capitalize">{formatearFecha(r.fecha)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {r.hora_entrada} → {r.hora_salida || "—"}
                      {r.estado_registro === "cerrado" && <span className="font-medium text-foreground"> · {hrs} h</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={r.estado_registro} />
                    {r.estado_registro !== "abierto" && (
                      r.validado ? (
                        <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">Validado</span>
                      ) : (
                        <span className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">Por validar</span>
                      )
                    )}
                  </div>
                </div>
              );
            })}
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