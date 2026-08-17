import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelArea } from "@/lib/areas";

// Muestra pases de lista activos para el área del alumno y le permite
// marcar su presencia. Se inserta en el dashboard del alumno.
export default function PaseListaAlumno() {
  const [perfil, setPerfil] = useState(null);
  const [pasesActivos, setPasesActivos] = useState([]);
  const [misRespuestas, setMisRespuestas] = useState([]);
  const [respondiendo, setRespondiendo] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setPerfil).catch(() => {});
  }, []);

  const cargar = async () => {
    if (!perfil) return;
    try {
      const activos = await base44.entities.Pases_Lista.filter({ estado: "activo" });
      const deMiArea = activos.filter((p) => p.area === perfil.area_asignada);
      setPasesActivos(deMiArea);

      if (deMiArea.length > 0) {
        const resp = await base44.entities.Respuestas_Pases_Lista.filter({ usuario: perfil.id });
        setMisRespuestas(resp);
      } else {
        setMisRespuestas([]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (perfil) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  // Suscripción: aparecer nuevos pases de lista en tiempo real
  useEffect(() => {
    if (!perfil) return;
    const unsub = base44.entities.Pases_Lista.subscribe((event) => {
      if (event.type === "create") cargar();
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  const yaRespondi = (paseId) => misRespuestas.some((r) => r.pase_lista === paseId);

  const marcarPresente = async (pase) => {
    setRespondiendo(pase.id);
    try {
      await base44.entities.Respuestas_Pases_Lista.create({
        pase_lista: pase.id,
        usuario: perfil.id,
        usuario_nombre: perfil.nombre_completo || perfil.full_name || "",
        fecha_respuesta: new Date().toISOString(),
      });
      setMisRespuestas((prev) => [...prev, { pase_lista: pase.id }]);
    } catch (e) {
      console.error(e);
    } finally {
      setRespondiendo(null);
    }
  };

  if (!perfil || pasesActivos.length === 0) return null;

  const pendientes = pasesActivos.filter((p) => !yaRespondi(p.id));
  if (pendientes.length === 0) return null;

  return (
    <div className="space-y-3">
      {pendientes.map((p) => (
        <div
          key={p.id}
          className="bg-amber-50 border border-amber-300 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-amber-400 flex items-center justify-center shrink-0 animate-pulse">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-amber-900">Pase de lista activo</p>
              <p className="text-sm text-amber-700">
                {labelArea(p.area)} · Iniciado por {p.creado_por_nombre || "Encargado"}
              </p>
              {p.mensaje && <p className="text-sm text-amber-600 mt-0.5">{p.mensaje}</p>}
            </div>
          </div>
          <Button
            onClick={() => marcarPresente(p)}
            disabled={respondiendo === p.id}
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
          >
            {respondiendo === p.id ? (
              <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Marcando...</>
            ) : (
              <><CheckCircle2 className="h-4 w-4 mr-1.5" /> Marcar presente</>
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}