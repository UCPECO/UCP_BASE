import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelArea } from "@/lib/areas";

// Un pase de lista solo se puede responder durante 6 horas desde su creación;
// después se considera olvidado aunque nadie lo haya cerrado.
const VIGENCIA_MS = 6 * 60 * 60 * 1000;
const fechaUTC = (created) => new Date(String(created).replace(" ", "T") + "Z").getTime();
const esVigente = (p) => {
  const t = fechaUTC(p.created_date);
  return !isNaN(t) && (Date.now() - t) < VIGENCIA_MS;
};

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

  const filtrarMios = (lista) =>
    (lista || []).filter((p) => p.estado === "activo" && p.area === perfil?.area_asignada && esVigente(p));

  const cargar = async () => {
    if (!perfil) return;
    try {
      const activos = await base44.entities.Pases_Lista.filter({ estado: "activo" });
      const deMiArea = filtrarMios(activos);
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

  // Suscripción: el cliente hace polling cada 5s y entrega la lista completa
  // como evento "update"; actualizamos sin otra petición al servidor.
  useEffect(() => {
    if (!perfil) return;
    const unsub = base44.entities.Pases_Lista.subscribe((event) => {
      if (event.type === "update" && Array.isArray(event.data)) {
        setPasesActivos(filtrarMios(event.data));
      }
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
        estado_respuesta: "presente",
      });
      setMisRespuestas((prev) => [...prev, { pase_lista: pase.id }]);
    } catch (e) {
      // Si la base de datos rechaza por duplicado, ya estaba respondido
      setMisRespuestas((prev) => [...prev, { pase_lista: pase.id }]);
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