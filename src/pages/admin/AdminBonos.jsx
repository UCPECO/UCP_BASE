import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Award, Sparkles, History, Trash2 } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";

const MOTIVOS = [
  "Participación destacada",
  "Apoyo en evento especial",
  "Reconocimiento por iniciativa",
  "Horas extra de colaboración",
  "Compensación por actividad adicional",
  "Premio por desempeño",
  "Otro",
];

export default function AdminBonos() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [alumnos, setAlumnos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [bonos, setBonos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({ usuario: "", asignacion: "", horas: "", motivo: MOTIVOS[0], motivoOtro: "", titulo: "", fecha: new Date().toISOString().split("T")[0] });

  const load = async () => {
    try {
      const [us, asigs, acts, bons] = await Promise.all([
        base44.entities.User.list("full_name", 500),
        base44.entities.Asignaciones.list("-created_date", 500),
        base44.entities.Actividades.list("nombre", 100),
        base44.entities.Bonos.list("-fecha", 200),
      ]);
      setAlumnos(us.filter(u => u.role === "servicio_social" || u.role === "voluntario"));
      setAsignaciones(asigs);
      setActividades(acts);
      setBonos(bons);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const alumnosById = {};
  alumnos.forEach(u => { alumnosById[u.id] = u; });
  const actsById = {};
  actividades.forEach(a => { actsById[a.id] = a; });

  const asignacionesDelAlumno = asignaciones.filter(a => a.usuario === form.usuario);

  const onSelectAlumno = (id) => {
    const asigActiva = asignaciones.find(a => a.usuario === id && a.estado === "activo");
    setForm(f => ({ ...f, usuario: id, asignacion: asigActiva ? asigActiva.id : (asignaciones.find(a => a.usuario === id)?.id || "") }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.usuario) { toast({ title: "Selecciona un alumno", variant: "destructive" }); return; }
    const hrs = parseFloat(form.horas);
    if (!hrs || hrs <= 0) { toast({ title: "Ingresa horas válidas", variant: "destructive" }); return; }
    const motivoFinal = form.motivo === "Otro" ? form.motivoOtro : form.motivo;
    const titulo = form.titulo || motivoFinal;
    setSaving(true);
    try {
      await base44.entities.Bonos.create({
        usuario: form.usuario,
        asignacion: form.asignacion,
        creado_por: user.id,
        horas: hrs,
        motivo: `${titulo}${motivoFinal && motivoFinal !== titulo ? " — " + motivoFinal : ""}`,
        fecha: form.fecha,
      });
      toast({ title: "Horas de premio asignadas", description: `${hrs} h a ${nombreUsuario(alumnosById[form.usuario])}` });
      setForm(f => ({ ...f, horas: "", titulo: "", motivoOtro: "" }));
      load();
    } catch (e) { toast({ title: "Error al asignar horas", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.Bonos.delete(id);
      toast({ title: "Bono eliminado" });
      load();
    } catch (e) { toast({ title: "Error al eliminar", variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2"><Award className="h-7 w-7 text-accent" /> Horas de premio</h1>
        <p className="text-sm text-muted-foreground mt-1">Asigna horas extra a alumnos de servicio social o voluntariado para acelerar su progreso.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2">
          <SectionCard title="Nueva asignación" subtitle="Horas extra o de premio" icon={Sparkles}>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Alumno</Label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.usuario} onChange={(e) => onSelectAlumno(e.target.value)}>
                  <option value="">Selecciona un alumno...</option>
                  {alumnos.map(a => (
                    <option key={a.id} value={a.id}>{nombreUsuario(a)} — {a.tipo_participante?.replace(/_/g, " ") || "alumno"}</option>
                  ))}
                </select>
              </div>

              {form.usuario && (
                <div className="space-y-1.5">
                  <Label>Asignación (opcional)</Label>
                  {asignacionesDelAlumno.length > 0 ? (
                    <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.asignacion} onChange={(e) => setForm(f => ({ ...f, asignacion: e.target.value }))}>
                      <option value="">Sin asignación específica</option>
                      {asignacionesDelAlumno.map(a => (
                        <option key={a.id} value={a.id}>{actsById[a.actividad]?.nombre || "Actividad"} ({a.estado})</option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-xs text-muted-foreground">El alumno no tiene asignación; las horas se registran de todas formas.</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Título del premio</Label>
                <Input placeholder="Ej. Reconocimiento por participación" value={form.titulo} onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Horas</Label>
                  <Input type="number" min="0.5" step="0.5" placeholder="5" value={form.horas} onChange={(e) => setForm(f => ({ ...f, horas: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha</Label>
                  <Input type="date" value={form.fecha} onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Motivo</Label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={form.motivo} onChange={(e) => setForm(f => ({ ...f, motivo: e.target.value }))}>
                  {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {form.motivo === "Otro" && (
                <Input placeholder="Describe el motivo..." value={form.motivoOtro} onChange={(e) => setForm(f => ({ ...f, motivoOtro: e.target.value }))} />
              )}

              <Button type="submit" disabled={saving} className="w-full">
                <Award className="h-4 w-4 mr-2" /> {saving ? "Asignando..." : "Asignar horas de premio"}
              </Button>
            </form>
          </SectionCard>
        </div>

        <div className="lg:col-span-3">
          <SectionCard title="Historial de bonos" subtitle={`${bonos.length} registro(s)`} icon={History}>
            {bonos.length === 0 ? (
              <EmptyState title="Sin bonos asignados" message="Las horas de premio que asignes aparecerán aquí." icon={Award} />
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                      <th className="py-2 pr-3 font-medium">Alumno</th>
                      <th className="py-2 pr-3 font-medium">Horas</th>
                      <th className="py-2 pr-3 font-medium">Motivo</th>
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bonos.map(b => (
                      <tr key={b.id} className="border-b border-border/50 last:border-0">
                        <td className="py-3 pr-3 font-medium">{nombreUsuario(alumnosById[b.usuario])}</td>
                        <td className="py-3 pr-3"><span className="inline-flex items-center gap-1 text-primary font-semibold"><Sparkles className="h-3.5 w-3.5" />{b.horas}h</span></td>
                        <td className="py-3 pr-3 text-muted-foreground max-w-[220px] truncate" title={b.motivo}>{b.motivo || "—"}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{formatearFecha(b.fecha)}</td>
                        <td className="py-3"><button onClick={() => handleDelete(b.id)} className="text-muted-foreground hover:text-destructive" title="Eliminar"><Trash2 className="h-4 w-4" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}