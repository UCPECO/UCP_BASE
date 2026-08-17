import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { sumarHorasRegistros, sumarHorasBonos, calcularPorcentaje, horasRestantes, META_HORAS_DEFAULT } from "@/lib/ucpUtils";

// Carga los datos completos del alumno actual: perfil, asignación, actividad, registros, bonos
export function useAlumnoData() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [perfil, setPerfil] = useState(null);
  const [asignacion, setAsignacion] = useState(null);
  const [actividad, setActividad] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [bonos, setBonos] = useState([]);
  const [horario, setHorario] = useState([]);
  const [eventos, setEventos] = useState([]);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const me = await base44.auth.me();
      setPerfil(me);
      const asigs = await base44.entities.Asignaciones.filter({ usuario: user.id }, "-created_date", 50);
      const activa = asigs.find(a => a.estado === "activo") || asigs[0];
      setAsignacion(activa);
      let act = null;
      if (activa?.actividad) {
        try { act = await base44.entities.Actividades.get(activa.actividad); } catch {}
      }
      setActividad(act);
      const regs = await base44.entities.Registros_QR.filter({ usuario: user.id }, "-fecha", 100);
      setRegistros(regs);
      const bons = await base44.entities.Bonos.filter({ usuario: user.id }, "-fecha", 50);
      setBonos(bons);
      const hor = await base44.entities.Horarios_Clase.filter({ usuario: user.id }, "dia_semana", 50);
      setHorario(hor);
      const evs = await base44.entities.Eventos.list("fecha", 50);
      const tipo = me?.tipo_participante || "voluntario";
      setEventos(evs.filter(e => e.visible_para === "todos" || e.visible_para === tipo));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);

  const horasAcumuladas = sumarHorasRegistros(registros);
  const horasBono = sumarHorasBonos(bonos);
  const totalHoras = Math.round((horasAcumuladas + horasBono) * 100) / 100;
  const meta = actividad?.meta_horas || META_HORAS_DEFAULT;
  const porcentaje = calcularPorcentaje(totalHoras, meta);
  const restantes = horasRestantes(totalHoras, meta);

  return {
    loading, perfil, asignacion, actividad, registros, bonos, horario, eventos,
    horasAcumuladas, horasBono, totalHoras, meta, porcentaje, restantes, reload: load
  };
}