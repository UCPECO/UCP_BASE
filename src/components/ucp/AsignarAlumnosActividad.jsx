import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { X, UserPlus, Check } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function AsignarAlumnosActividad({ actividad, onClose }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [alumnos, setAlumnos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      let us;
      if (isAdmin) {
        const resp = await base44.entities.User.list("full_name", 500);
        us = resp.filter((u) => !u.archivado && (u.role === "servicio_social" || u.role === "voluntario"));
      } else {
        const resp = await base44.functions.invoke("ObtenerPersonalArea", {});
        us = (resp.data?.users || []).filter((u) => u.role === "servicio_social" || u.role === "voluntario");
      }
      setAlumnos(us);
      const asigs = await base44.entities.Asignaciones.list("-created_date", 500);
      setAsignaciones(asigs.filter((a) => a.actividad === actividad.id));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const asignadosIds = new Set(asignaciones.map((a) => a.usuario));

  const toggle = async (alumno) => {
    setBusy(alumno.id);
    try {
      const asig = asignaciones.find((a) => a.usuario === alumno.id);
      if (asig) {
        await base44.entities.Asignaciones.delete(asig.id);
        toast({ title: "Asignación retirada" });
      } else {
        await base44.entities.Asignaciones.create({
          usuario: alumno.id,
          actividad: actividad.id,
          fecha_inicio: new Date().toISOString().split("T")[0],
          estado: "activo",
        });
        toast({ title: "Alumno asignado", description: alumno.nombre_completo || alumno.full_name });
      }
      await load();
    } catch (e) {
      toast({ title: "Error al asignar", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SectionCard
      title={`Asignar alumnos · ${actividad.nombre}`}
      subtitle={`${asignadosIds.size} alumno(s) asignado(s)`}
      icon={UserPlus}
      action={
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
        </div>
      ) : alumnos.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No hay alumnos registrados.</p>
      ) : (
        <div className="max-h-80 overflow-y-auto scrollbar-thin space-y-1">
          {alumnos.map((a) => {
            const on = asignadosIds.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggle(a)}
                disabled={busy === a.id}
                className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors disabled:opacity-60 ${on ? "bg-emerald-50" : "hover:bg-muted/60"}`}
              >
                <div className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-input"}`}>
                  {on && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{a.nombre_completo || a.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.email} · {(a.tipo_participante || a.role || "").replace(/_/g, " ")}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex justify-end mt-4">
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
      </div>
    </SectionCard>
  );
}