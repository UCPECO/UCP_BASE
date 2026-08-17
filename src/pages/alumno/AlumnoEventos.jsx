import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MapPin, Clock } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { formatearFecha } from "@/lib/ucpUtils";

const COLOR_MAP = {
  azul: "bg-blue-100 text-blue-700 border-blue-200",
  verde: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rojo: "bg-rose-100 text-rose-700 border-rose-200",
  amarillo: "bg-amber-100 text-amber-700 border-amber-200",
  morado: "bg-purple-100 text-purple-700 border-purple-200",
  naranja: "bg-orange-100 text-orange-700 border-orange-200",
};

const TIPO_LABEL = {
  capacitacion: "Capacitación", junta: "Junta", actividad_especial: "Actividad especial",
  dia_festivo: "Día festivo", taller: "Taller", visita: "Visita", otro: "Otro"
};

export default function AlumnoEventos() {
  const { user } = useAuth();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const evs = await base44.entities.Eventos.list("fecha", 50);
        const tipo = user?.tipo_participante || "voluntario";
        const visibles = evs.filter(e => e.visible_para === "todos" || e.visible_para === tipo);
        setEventos(visibles.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)));
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, [user?.id]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  const proximos = eventos.filter(e => new Date(e.fecha) >= new Date(new Date().toDateString()));
  const pasados = eventos.filter(e => new Date(e.fecha) < new Date(new Date().toDateString()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Eventos UCP</h1>
        <p className="text-sm text-muted-foreground mt-1">Capacitaciones, juntas y actividades especiales</p>
      </div>

      {eventos.length === 0 ? (
        <SectionCard><EmptyState title="Sin eventos" message="No hay eventos programados por ahora. ¡Pronto habrá noticias!" image="/branding/mascota-anuncio.png" /></SectionCard>
      ) : (
        <>
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Próximos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proximos.map((ev) => <EventCard key={ev.id} ev={ev} />)}
            </div>
            {proximos.length === 0 && <p className="text-sm text-muted-foreground">No hay eventos próximos.</p>}
          </div>
          {pasados.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-6">Pasados</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pasados.map((ev) => <EventCard key={ev.id} ev={ev} past />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EventCard({ ev, past }) {
  const colorCls = COLOR_MAP[ev.color] || COLOR_MAP.azul;
  return (
    <div className={`bg-card rounded-2xl border ${past ? "opacity-60" : ""} border-border shadow-sm p-5`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colorCls} border`}>{TIPO_LABEL[ev.tipo_evento] || ev.tipo_evento}</div>
        <span className="text-xs text-muted-foreground">{formatearFecha(ev.fecha)}</span>
      </div>
      <h3 className="font-semibold font-heading text-lg">{ev.titulo}</h3>
      {ev.descripcion && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{ev.descripcion}</p>}
      <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {ev.hora_inicio} – {ev.hora_fin}</span>
        {ev.ubicacion && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {ev.ubicacion}</span>}
      </div>
    </div>
  );
}