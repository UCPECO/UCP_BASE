import React, { useEffect, useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useEncargadoData } from "@/lib/useEncargadoData";
import { Clock, Users } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import DisponibilidadSemanal from "@/components/ucp/DisponibilidadSemanal";
import { calcularDisponibilidad } from "@/lib/ucpUtils";
import { esParticipante } from "@/lib/roles";

export default function Disponibilidad() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { loading, alumnos } = useEncargadoData();
  const [allAlumnos, setAllAlumnos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [selId, setSelId] = useState(null);
  const [loadingHorarios, setLoadingHorarios] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    base44.entities.User.list("full_name", 500)
      .then(us => setAllAlumnos(us.filter(u => esParticipante(u.role))))
      .catch(() => {});
  }, [isAdmin]);

  const lista = isAdmin ? allAlumnos : alumnos;

  useEffect(() => {
    if (!selId) return;
    setLoadingHorarios(true);
    base44.entities.Horarios_Clase.filter({ usuario: selId }, "dia_semana", 100)
      .then(setHorarios)
      .finally(() => setLoadingHorarios(false));
  }, [selId]);

  const disp = useMemo(() => calcularDisponibilidad(horarios), [horarios]);
  const totalLibres = useMemo(() => Object.values(disp).reduce((a, d) => a + d.horasLibres, 0), [disp]);
  const totalOcupadas = useMemo(() => Object.values(disp).reduce((a, d) => a + d.horasOcupadas, 0), [disp]);
  const alumnoSel = lista.find(a => a.id === selId);

  if (loading && !isAdmin) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <Clock className="h-7 w-7 text-primary" /> Disponibilidad de alumnos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Revisa si cada alumno está libre dentro del horario laboral (9:00–17:00)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Alumnos" icon={Users}>
          {lista.length === 0 ? (
            <EmptyState title="Sin alumnos" message="No hay alumnos para mostrar." icon={Users} />
          ) : (
            <div className="space-y-1 max-h-[28rem] overflow-y-auto scrollbar-thin pr-1">
              {lista.map(a => (
                <button key={a.id} onClick={() => setSelId(a.id)}
                  className={`w-full text-left flex items-center gap-2.5 p-2.5 rounded-lg border transition-colors ${selId === a.id ? "bg-primary/10 border-primary" : "border-transparent hover:bg-muted"}`}>
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0">
                    {(a.nombre_completo || a.full_name || "?").charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{a.nombre_completo || a.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{a.matricula || "Sin matrícula"}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="lg:col-span-2">
          {!alumnoSel ? (
            <SectionCard>
              <EmptyState title="Selecciona un alumno" message="Elige un alumno para ver su disponibilidad semanal." icon={Clock} />
            </SectionCard>
          ) : loadingHorarios ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              <SectionCard title={alumnoSel.nombre_completo || alumnoSel.full_name} subtitle={`${alumnoSel.matricula || "Sin matrícula"} · ${alumnoSel.carrera || "—"}`}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-xs text-emerald-700 font-medium uppercase">Horas libres / semana</p>
                    <p className="text-2xl font-bold text-emerald-700">{totalLibres}h</p>
                    <p className="text-xs text-emerald-600">dentro de 9:00–17:00</p>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                    <p className="text-xs text-rose-700 font-medium uppercase">Horas con clase</p>
                    <p className="text-2xl font-bold text-rose-700">{totalOcupadas}h</p>
                    <p className="text-xs text-rose-600">de 40h laborales</p>
                  </div>
                </div>
              </SectionCard>
              <DisponibilidadSemanal disponibilidad={disp} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}