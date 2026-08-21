import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Filter } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { calcularDisponibilidad, DIAS_SEMANA, nombreUsuario } from "@/lib/ucpUtils";
import { esParticipante } from "@/lib/roles";

export default function FiltrosAlumnosAdmin() {
  const [users, setUsers] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fFacultad, setFFacultad] = useState("");
  const [fCarrera, setFCarrera] = useState("");
  const [fPrograma, setFPrograma] = useState("");
  const [soloCumplen, setSoloCumplen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [us, hs] = await Promise.all([
          base44.entities.User.list("full_name", 500),
          base44.entities.Horarios_Clase.list("dia_semana", 500),
        ]);
        setUsers(us.filter(u => esParticipante(u.role)));
        setHorarios(hs);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const facultades = [...new Set(users.map(u => u.facultad).filter(Boolean))].sort();
  const carreras = [...new Set(users.map(u => u.carrera).filter(Boolean))].sort();
  const programas = [...new Set(users.map(u => u.tipo_participante).filter(Boolean))].sort();

  const datos = users.map(u => {
    const misHs = horarios.filter(h => h.usuario === u.id);
    const disp = calcularDisponibilidad(misHs);
    const horasLibresSemana = DIAS_SEMANA.reduce((acc, d) => acc + (disp[d]?.horasLibres || 0), 0);
    const tieneHorario = misHs.length > 0;
    const cumple = tieneHorario && horasLibresSemana >= 10;
    return { user: u, tieneHorario, horasLibresSemana: Math.round(horasLibresSemana * 100) / 100, cumple };
  });

  const filtrados = datos.filter(d =>
    (!fFacultad || d.user.facultad === fFacultad) &&
    (!fCarrera || d.user.carrera === fCarrera) &&
    (!fPrograma || d.user.tipo_participante === fPrograma) &&
    (!soloCumplen || d.cumple)
  );
  const cumplenCount = filtrados.filter(d => d.cumple).length;

  return (
    <SectionCard
      title="Organización de alumnos"
      subtitle="Filtra por facultad, carrera o programa y revisa el cumplimiento del horario laboral"
      action={
        <span className="text-xs text-muted-foreground hidden sm:block">{cumplenCount} de {filtrados.length} cumplen horario</span>
      }
    >
      <div className="flex flex-wrap gap-3 mb-4">
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={fFacultad} onChange={(e) => setFFacultad(e.target.value)}>
          <option value="">Todas las facultades</option>
          {facultades.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={fCarrera} onChange={(e) => setFCarrera(e.target.value)}>
          <option value="">Todas las carreras</option>
          {carreras.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={fPrograma} onChange={(e) => setFPrograma(e.target.value)}>
          <option value="">Todos los programas</option>
          {programas.map(p => <option key={p} value={p}>{p.replace(/_/g, " ")}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={soloCumplen} onChange={(e) => setSoloCumplen(e.target.checked)} className="rounded border-input" />
          Solo cumplen horario
        </label>
      </div>

      {loading ? (
        <div className="skeleton h-16 w-full rounded-xl" />
      ) : filtrados.length === 0 ? (
        <EmptyState title="Sin resultados" message="No hay alumnos que coincidan con los filtros." icon={Filter} />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-2 py-2 font-medium">Alumno</th>
                <th className="px-2 py-2 font-medium">Facultad</th>
                <th className="px-2 py-2 font-medium">Carrera</th>
                <th className="px-2 py-2 font-medium">Programa</th>
                <th className="px-2 py-2 font-medium text-right">Hrs. disp./sem</th>
                <th className="px-2 py-2 font-medium">Horario</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(d => (
                <tr key={d.user.id} className="border-b border-border/60 hover:bg-muted/30">
                  <td className="px-2 py-2.5 font-medium">{nombreUsuario(d.user)}</td>
                  <td className="px-2 py-2.5">{d.user.facultad || "—"}</td>
                  <td className="px-2 py-2.5">{d.user.carrera || "—"}</td>
                  <td className="px-2 py-2.5 capitalize">{(d.user.tipo_participante || "—").replace(/_/g, " ")}</td>
                  <td className="px-2 py-2.5 text-right font-medium">{d.tieneHorario ? `${d.horasLibresSemana}h` : "—"}</td>
                  <td className="px-2 py-2.5">
                    {d.cumple ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">✓ Cumple</span>
                    ) : d.tieneHorario ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">Reducido</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-xs font-medium">Sin horario</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}