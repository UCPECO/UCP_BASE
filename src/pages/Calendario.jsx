import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays } from "lucide-react";
import CalendarioGeneral from "@/components/ucp/CalendarioGeneral";
import SectionCard from "@/components/ucp/SectionCard";
import { formatearFecha } from "@/lib/ucpUtils";

const TIPO_LABEL = {
  capacitacion: "Capacitación", junta: "Junta", actividad_especial: "Actividad especial",
  dia_festivo: "Día festivo", taller: "Taller", visita: "Visita", otro: "Otro",
};
const COLOR_EVENTO = {
  azul: "bg-blue-500", verde: "bg-emerald-500", rojo: "bg-rose-500",
  amarillo: "bg-amber-500", morado: "bg-purple-500", naranja: "bg-orange-500",
};

export default function Calendario() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("todos");

  useEffect(() => {
    base44.entities.Eventos.list("fecha", 500)
      .then(setEventos)
      .finally(() => setLoading(false));
  }, []);

  const eventosFiltrados = filtro === "todos" ? eventos : eventos.filter(e => e.tipo_evento === filtro);
  const proximos = eventos
    .filter(e => new Date(e.fecha) >= new Date(new Date().toDateString()))
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <CalendarDays className="h-7 w-7 text-primary" /> Calendario general
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Eventos, capacitaciones, juntas y actividades especiales de UCP</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CalendarioGeneral eventos={eventosFiltrados} />
          </div>
          <SectionCard title="Próximos eventos" icon={CalendarDays}>
            <div className="flex flex-wrap gap-1.5 mb-3">
              <FiltroBtn label="Todos" active={filtro === "todos"} onClick={() => setFiltro("todos")} />
              {Object.entries(TIPO_LABEL).map(([k, v]) => (
                <FiltroBtn key={k} label={v} active={filtro === k} onClick={() => setFiltro(k)} />
              ))}
            </div>
            {proximos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>
            ) : (
              <div className="space-y-2">
                {proximos.slice(0, 10).map(e => (
                  <div key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLOR_EVENTO[e.color] || "bg-blue-500"}`} />
                    <span className="font-medium w-20 shrink-0">{formatearFecha(e.fecha)}</span>
                    <span className="text-muted-foreground truncate">{e.titulo} · {e.hora_inicio}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function FiltroBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted"}`}>
      {label}
    </button>
  );
}