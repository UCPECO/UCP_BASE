import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Award, Download, Loader2, FileText } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { ListaSkeleton } from "@/components/ucp/Skeleton";
import { Button } from "@/components/ui/button";
import { formatearFecha } from "@/lib/ucpUtils";
import { generarConstanciaPDF } from "@/lib/generarConstancia";
import { labelArea } from "@/lib/areas";

const TIPOS = {
  constancia_termino: "Constancia de Término",
  reconocimiento: "Reconocimiento",
  recomendacion: "Carta de Recomendación",
};

export default function AlumnoConstancias() {
  const [perfil, setPerfil] = useState(null);
  const [constancias, setConstancias] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(async (p) => {
      setPerfil(p);
      try {
        const lista = await base44.entities.Constancias.filter({ usuario: p.id });
        setConstancias(lista);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <Award className="h-7 w-7 text-primary" /> Mis Constancias
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Descarga tus documentos oficiales generados por la UCP.</p>
      </div>

      <SectionCard title="Constancias emitidas" subtitle={`${constancias.length} documento(s)`}>
        {loading ? (
          <ListaSkeleton filas={3} />
        ) : constancias.length === 0 ? (
          <EmptyState title="Sin constancias" message="Aún no tienes constancias emitidas. Cuando completes tu servicio social, el administrador generará tu constancia." icon={Award} />
        ) : (
          <div className="space-y-2">
            {constancias.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{TIPOS[c.tipo] || "Constancia"}</p>
                  <p className="text-xs text-muted-foreground">
                    {labelArea(c.area)} · Folio {c.folio} · {formatearFecha(c.created_date)}
                    {c.horas_completadas > 0 && ` · ${c.horas_completadas} hrs`}
                  </p>
                </div>
                <StatusBadge status={c.estado} />
                {c.estado === "vigente" && (
                  <Button variant="outline" size="sm" onClick={() => generarConstanciaPDF(c)}>
                    <Download className="h-4 w-4 mr-1.5" /> Descargar
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}