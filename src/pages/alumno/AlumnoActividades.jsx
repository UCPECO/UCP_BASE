import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { FolderKanban, Plus, Check, UserCog, Users } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { labelArea } from "@/lib/areas";

export default function AlumnoActividades() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [actividades, setActividades] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const isAdmin = user?.role === "admin";

  const load = async () => {
    try {
      const [acts, asigs] = await Promise.all([
        base44.entities.Actividades.list("nombre", 200),
        base44.entities.Asignaciones.list("-created_date", 500),
      ]);
      setActividades(acts.filter((a) => a.activo && (isAdmin || !user?.area_asignada || a.categoria === user.area_asignada)));
      setAsignaciones(asigs);
      if (isAdmin) {
        const us = await base44.entities.User.list("full_name", 500);
        setUsuarios(us);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const usersById = {};
  usuarios.forEach((u) => { usersById[u.id] = u; });
  const encargadosById = {};
  usuarios.filter((u) => u.role === "encargado").forEach((u) => { encargadosById[u.id] = u; });

  const misAsignaciones = asignaciones.filter((a) => a.usuario === user?.id && a.estado === "activo");
  const miActividadIds = new Set(misAsignaciones.map((a) => a.actividad));

  const inscritosDe = (actId) =>
    asignaciones.filter((a) => a.actividad === actId).map((a) => usersById[a.usuario]).filter(Boolean);

  const toggle = async (act) => {
    setBusy(act.id);
    try {
      const asig = misAsignaciones.find((a) => a.actividad === act.id);
      if (asig) {
        await base44.entities.Asignaciones.delete(asig.id);
        toast({ title: "Te diste de baja de la actividad" });
      } else if (misAsignaciones.length > 0) {
        toast({ title: "Ya tienes una actividad activa", description: "Primero date de baja de tu actividad actual para unirte a otra.", variant: "destructive" });
        return;
      } else {
        await base44.entities.Asignaciones.create({
          usuario: user.id,
          actividad: act.id,
          fecha_inicio: new Date().toISOString().split("T")[0],
          estado: "activo",
        });
        toast({ title: "Te uniste a la actividad", description: act.nombre });
      }
      await load();
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <FolderKanban className="h-7 w-7 text-primary" /> {isAdmin ? "Alumnos por actividad" : "Actividades disponibles"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin ? "Consulta quiénes están inscritos en cada actividad." : (user?.area_asignada ? `Área designada: ${labelArea(user.area_asignada)} · Solicita a tu encargado o administrador para unirte o cambiarte de actividad.` : "Solicita a tu encargado o administrador para unirte o cambiarte de actividad.")}
        </p>
      </div>

      {actividades.length === 0 ? (
        <SectionCard><EmptyState title="Sin actividades" message={user?.area_asignada ? "Aún no hay actividades en tu área designada." : "Aún no hay actividades disponibles."} icon={FolderKanban} /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {actividades.map((a) => {
            const unido = miActividadIds.has(a.id);
            const inscritos = inscritosDe(a.id);
            return (
              <div key={a.id} className="bg-card rounded-2xl border border-border shadow-sm p-5 flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold">{a.nombre}</p>
                    <p className="text-xs text-muted-foreground">{labelArea(a.categoria)}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Activa</span>
                </div>
                {a.descripcion && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{a.descripcion}</p>}

                {isAdmin && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UserCog className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Encargados: {usuarios.filter((u) => u.role === "encargado" && u.area_encargada === a.categoria).map((u) => u.nombre_completo || u.full_name).join(", ") || "Sin asignar"}
                    </span>
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <Users className="h-3.5 w-3.5" /> Inscritos ({inscritos.length})
                    </p>
                    {inscritos.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70">Nadie inscrito aún.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {inscritos.map((u) => (
                          <span key={u.id} className="px-2 py-0.5 rounded-full bg-muted text-xs text-foreground">
                            {u.nombre_completo || u.full_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!isAdmin && (
                  <div className="mt-auto pt-4">
                    {unido ? (
                      <span className="block w-full text-center px-3 py-2 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700">Tu actividad actual</span>
                    ) : (
                      <span className="block w-full text-center px-3 py-2 rounded-md text-xs text-muted-foreground bg-muted/60">Solicítalo al encargado/admin</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}