import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import useRecargarAlVolver from "@/hooks/useRecargarAlVolver";
import { useAuth } from "@/lib/AuthContext";
import { ClipboardCheck, LogOut, ShieldCheck } from "lucide-react";
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
  const [meArea, setMeArea] = useState("");

  const load = async () => {
    try {
      const [regs, us, asigs, acts, me] = await Promise.all([
        base44.entities.Registros_QR.list("-fecha", 500),
        base44.entities.User.list("full_name", 500),
        base44.entities.Asignaciones.list("-created_date", 500),
        base44.entities.Actividades.list("nombre", 200),
        base44.auth.me().catch(() => null),
      ]);
      setRegistros(regs);
      setUsers(us);
      setAsignaciones(asigs);
      setActividades(acts);
      setMeArea(me?.area_encargada || "");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useRecargarAlVolver(load);

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

  const validar = async (r) => {
    try {
      await base44.entities.Registros_QR.update(r.id, { validado: 1, validado_por: user.id });
      toast({ title: "Fichaje validado", description: "Las horas ya cuentan para la meta del alumno" });
      load();
    } catch (e) { toast({ title: "Error al validar", variant: "destructive" }); }
  };

  const abiertos = registros.filter((r) => r.estado_registro === "abierto");
  // Fichajes cerrados sin validar, del área que encarga (si tiene área asignada)
  const porValidar = registros.filter((r) => {
    if (r.estado_registro !== "cerrado" && r.estado_registro !== "incompleto") return false;
    if (r.validado) return false;
    if (!meArea) return true;
    const alumno = users.find((u) => u.id === r.usuario);
    return alumno?.area_asignada === meArea;
  });

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Registros abiertos</h1>
        <p className="text-sm text-muted-foreground mt-1">{abiertos.length} registro(s) sin salida en todo el personal</p>
      </div>

      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/8 border border-primary/20 text-foreground text-xs">
        <LogOut className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Puedes <b>cerrar el turno</b> de cualquier persona. Si la salida supera las 17:15 o incluyes un comentario, se generará una <b>incidencia</b> con el reporte. No puedes modificar horas manualmente.
        </span>
      </div>

      {abiertos.length === 0 ? (
        <SectionCard><EmptyState title="Sin registros abiertos" message="Todos los fichajes están cerrados." icon={ClipboardCheck} /></SectionCard>
      ) : (
        <div className="space-y-3">
          {abiertos.map((r) => {
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

      {/* Por validar: fichajes cerrados de mi área que aún no cuentan para la meta */}
      <SectionCard title={`Por validar (${porValidar.length})`} subtitle="Fichajes cerrados que aún no cuentan para la meta del alumno" icon={ShieldCheck}>
        {porValidar.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Todo validado. 👍</p>
        ) : (
          <div className="space-y-2">
            {porValidar.slice(0, 30).map((r) => {
              const alumno = users.find((u) => u.id === r.usuario);
              const hrs = r.hora_salida ? calcularHoras(r.hora_entrada, r.hora_salida) : 0;
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-lg border border-border">
                  <div>
                    <p className="text-sm font-medium">{alumno?.nombre_completo || alumno?.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground">{formatearFecha(r.fecha)} · {r.hora_entrada} → {r.hora_salida || "—"} · {hrs} h</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300" onClick={() => validar(r)}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Validar
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}