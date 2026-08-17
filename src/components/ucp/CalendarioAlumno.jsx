import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, BookOpen, CalendarDays } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import { formatearFecha } from "@/lib/ucpUtils";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const COLOR_EVENTO = {
  azul: "bg-blue-500", verde: "bg-emerald-500", rojo: "bg-rose-500",
  amarillo: "bg-amber-500", morado: "bg-purple-500", naranja: "bg-orange-500",
};

// Convierte "Lunes" -> 1 (lunes=1 ... domingo=0)
function diaASemana(dia) {
  const map = { Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5, Sábado: 6, Domingo: 0 };
  return map[dia];
}

export default function CalendarioAlumno({ horarios = [], eventos = [] }) {
  const hoy = new Date();
  const [mesActual, setMesActual] = useState(hoy.getMonth());
  const [anioActual, setAnioActual] = useState(hoy.getFullYear());
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);

  const primerDia = new Date(anioActual, mesActual, 1);
  let inicioSemana = primerDia.getDay(); // 0=domingo
  // Convertir a base lunes=0
  inicioSemana = inicioSemana === 0 ? 6 : inicioSemana - 1;
  const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();

  // Eventos del mes actual
  const eventosMes = useMemo(() => {
    return eventos.filter(e => {
      const f = new Date(e.fecha);
      return f.getMonth() === mesActual && f.getFullYear() === anioActual;
    });
  }, [eventos, mesActual, anioActual]);

  // Mapa: día-del-mes -> [eventos]
  const eventosPorDia = useMemo(() => {
    const m = {};
    eventosMes.forEach(e => {
      const d = new Date(e.fecha).getDate();
      if (!m[d]) m[d] = [];
      m[d].push(e);
    });
    return m;
  }, [eventosMes]);

  // Horarios por día de la semana (recurrentes)
  const horariosPorDiaSemana = useMemo(() => {
    const m = {};
    horarios.forEach(h => {
      const idx = diaASemana(h.dia_semana);
      if (idx === undefined) return;
      if (!m[idx]) m[idx] = [];
      m[idx].push(h);
    });
    return m;
  }, [horarios]);

  const celdas = [];
  for (let i = 0; i < inicioSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);

  const mesAnterior = () => {
    let m = mesActual - 1, a = anioActual;
    if (m < 0) { m = 11; a--; }
    setMesActual(m); setAnioActual(a); setDiaSeleccionado(null);
  };
  const mesSiguiente = () => {
    let m = mesActual + 1, a = anioActual;
    if (m > 11) { m = 0; a++; }
    setMesActual(m); setAnioActual(a); setDiaSeleccionado(null);
  };

  const eventosDiaSel = diaSeleccionado ? (eventosPorDia[diaSeleccionado] || []) : [];
  const diaSemanaSel = diaSeleccionado ? new Date(anioActual, mesActual, diaSeleccionado).getDay() : -1;
  const horariosDiaSel = diaSeleccionado ? (horariosPorDiaSemana[diaSemanaSel] || []) : [];

  return (
    <SectionCard title="Calendario" subtitle="Horarios de clase y eventos" icon={CalendarDays}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={mesAnterior} className="p-1.5 hover:bg-muted rounded-lg"><ChevronLeft className="h-5 w-5" /></button>
        <h3 className="font-semibold font-heading">{MESES[mesActual]} {anioActual}</h3>
        <button onClick={mesSiguiente} className="p-1.5 hover:bg-muted rounded-lg"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS.map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}
        {celdas.map((d, i) => {
          if (d === null) return <div key={i} />;
          const esHoy = d === hoy.getDate() && mesActual === hoy.getMonth() && anioActual === hoy.getFullYear();
          const evs = eventosPorDia[d] || [];
          const tieneHorario = horariosPorDiaSemana[new Date(anioActual, mesActual, d).getDay()];
          const sel = diaSeleccionado === d;
          return (
            <button
              key={i}
              onClick={() => setDiaSeleccionado(d)}
              className={`aspect-square rounded-lg text-sm flex flex-col items-center justify-center relative transition-colors border
                ${sel ? "bg-emerald-600 text-white border-emerald-600" :
                  esHoy ? "bg-emerald-50 border-emerald-300 font-bold" :
                  "border-transparent hover:bg-muted"}`}
            >
              {d}
              <div className="flex gap-0.5 absolute bottom-1">
                {evs.slice(0, 3).map((e, idx) => (
                  <span key={idx} className={`h-1.5 w-1.5 rounded-full ${COLOR_EVENTO[e.color] || "bg-blue-500"}`} />
                ))}
                {tieneHorario && <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle del día seleccionado */}
      {diaSeleccionado && (
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <p className="text-sm font-semibold">{formatearFecha(`${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(diaSeleccionado).padStart(2, "0")}`)}</p>
          {eventosDiaSel.length === 0 && horariosDiaSel.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin actividades este día.</p>
          )}
          {horariosDiaSel.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Clases</p>
              <div className="space-y-1.5">
                {horariosDiaSel.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-secondary rounded-lg px-3 py-1.5">
                    <span className="font-medium">{h.hora_inicio}–{h.hora_fin}</span>
                    {h.materia && <span className="text-muted-foreground">· {h.materia}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {eventosDiaSel.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Eventos</p>
              <div className="space-y-1.5">
                {eventosDiaSel.map((e) => (
                  <div key={e.id} className="flex items-center gap-2 text-sm bg-card border border-border rounded-lg px-3 py-1.5">
                    <span className={`h-2 w-2 rounded-full ${COLOR_EVENTO[e.color] || "bg-blue-500"}`} />
                    <span className="font-medium">{e.hora_inicio}</span>
                    <span>{e.titulo}</span>
                    {e.ubicacion && <span className="text-muted-foreground text-xs">· {e.ubicacion}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Próximos eventos */}
      {eventos.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Próximos eventos</p>
          <div className="space-y-1.5">
            {eventos
              .filter(e => new Date(e.fecha) >= new Date(new Date().toDateString()))
              .slice(0, 3)
              .map(e => (
                <div key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${COLOR_EVENTO[e.color] || "bg-blue-500"}`} />
                  <span className="font-medium">{formatearFecha(e.fecha)}</span>
                  <span className="text-muted-foreground">· {e.titulo}</span>
                </div>
              ))}
            {eventos.filter(e => new Date(e.fecha) >= new Date(new Date().toDateString())).length === 0 && (
              <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}