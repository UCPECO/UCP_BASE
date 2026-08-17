import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarClock, Loader2 } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { formatearFecha } from "@/lib/ucpUtils";

export default function EventosGoogleCalendar() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.invoke("ObtenerEventosGoogleCalendar", {});
        setEventos(res.data?.eventos || []);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SectionCard title="Calendario UCP sincronizado" subtitle="Eventos de Google Calendar" icon={CalendarClock}>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Sincronizando…
        </div>
      ) : error ? (
        <EmptyState title="Sin sincronización" message="No se pudo conectar con Google Calendar." icon={CalendarClock} />
      ) : eventos.length === 0 ? (
        <EmptyState title="Sin eventos próximos" message="No hay eventos en el calendario UCP para los próximos 30 días." icon={CalendarClock} />
      ) : (
        <div className="space-y-2">
          {eventos.slice(0, 8).map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                {new Date(e.fecha).getDate()}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm text-foreground truncate">{e.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatearFecha(e.fecha)}
                  {!e.es_todo_el_dia && e.hora_inicio ? ` · ${e.hora_inicio}${e.hora_fin ? `–${e.hora_fin}` : ""}` : " · Todo el día"}
                  {e.ubicacion ? ` · ${e.ubicacion}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}