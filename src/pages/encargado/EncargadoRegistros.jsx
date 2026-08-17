import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ClipboardCheck, LogOut } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, horaActual, calcularHoras } from "@/lib/ucpUtils";
import { cerrarRegistroConIncidencia } from "@/lib/cerrarFichaje";

export default function EncargadoRegistros() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [registros, setRegistros] = useState([]);
  const [users, setUsers] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [comentario, setComentario] = useState("");

  const load = async () => {
    try {
      const [regs, us, asigs, acts] = await Promise.all([
        base44.entities.Registros_QR.list("-fecha", 500),
        base44.entities.User.list("full_name", 500),
        base44.entities.Asignaciones.list("-created_date", 500),
        base44.entities.Actividades.list("nombre", 200),
      ]);
      setRegistros(regs.filter((r) => r.estado_registro === "abierto"));
      setUsers(us);
      setAsignaciones(asigs);
      setActividades(acts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const marcarSalida = async (reg) => {
    const salida = horaActual();
    const alumno = users.find((u) => u.id === reg.usuario);
    const horas = calcularHoras(reg.hora_entrada, salida);
    try {
      const { incidenciaGenerada } = await cerrarRegistroConIncidencia({
        registro: reg, salida, horas, comentario, rolUsuario: alumno?.role, modificadoPor: user.id,
      });
      toast({ title: "Salida marcada", description: incidenciaGenerada ? "Se generó una incidencia con el reporte." : `Hora: ${salida}` });
      setEditId(null); setComentario("");
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Registros abiertos</h1>
        <p className="text-sm text-muted-foreground mt-1">{registros.length} registro(s) sin salida en todo el personal</p>
      </div>

      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/8 border border-primary/20 text-foreground text-xs">
        <LogOut className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Puedes <b>cerrar el turno</b> de cualquier persona. Si la salida supera las 17:15 o incluyes un comentario, se generará una <b>incidencia</b> con el reporte. No puedes modificar horas manualmente.
        </span>
      </div>

      {registros.length === 0 ? (
        <SectionCard><EmptyState title="Sin registros abiertos" message="Todos los fichajes están cerrados." icon={ClipboardCheck} /></SectionCard>
      ) : (
        <div className="space-y-3">
          {registros.map((r) => {
            const alumno = users.find((u) => u.id === r.usuario);
            const asig = asignaciones.find((a) => a.id === r.asignacion);
            const act = actividades.find((a) => a.id === asig?.actividad);
            return (
              <div key={r.id} className="bg-card rounded-2xl border border-border shadow-sm p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                      <LogOut className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold">{alumno?.nombre_completo || alumno?.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{formatearFecha(r.fecha)} · Entrada: {r.hora_entrada}{act ? ` · ${act.nombre}` : ""}</p>
                    </div>
                  </div>
                  {editId === r.id ? (
                    <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2 items-end">
                      <Textarea placeholder="Motivo del cierre (opcional)" value={comentario} onChange={(e) => setComentario(e.target.value)} className="w-full sm:w-64" rows={2} />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => marcarSalida(r)}>Confirmar salida</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditId(null); setComentario(""); }}>Cancelar</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setEditId(r.id)}><LogOut className="h-4 w-4 mr-1" /> Cerrar turno</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}