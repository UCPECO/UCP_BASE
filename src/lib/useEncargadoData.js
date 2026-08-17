import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

// Carga las actividades del área encargada del usuario actual y sus alumnos
export function useEncargadoData() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState(null);
  const [areaEncargada, setAreaEncargada] = useState("");
  const [misActividades, setMisActividades] = useState([]);
  const [alumnos, setAlumnos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setPerfil(me);
      const area = me.area_encargada || "";
      setAreaEncargada(area);
      const all = await base44.entities.Actividades.list("nombre", 200);
      const acts = area ? all.filter((a) => a.categoria === area) : [];
      setMisActividades(acts);
      const actIdSet = new Set(acts.map((a) => a.id));
      const asigs = await base44.entities.Asignaciones.list("-created_date", 500);
      const misAsigs = asigs.filter((a) => actIdSet.has(a.actividad));
      setAsignaciones(misAsigs);
      const userIds = [...new Set(misAsigs.map((a) => a.usuario))];
      if (userIds.length > 0) {
        const resp = await base44.functions.invoke("ObtenerPersonalArea", {});
        const allUsers = resp.data?.users || [];
        setAlumnos(allUsers.filter((u) => userIds.includes(u.id)));
      } else {
        setAlumnos([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  return { loading, perfil, areaEncargada, misActividades, alumnos, asignaciones, reload: load };
}