import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Calendar, Plus, Trash2, Info } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { ListaSkeleton } from "@/components/ucp/Skeleton";
import { calcularHoras } from "@/lib/ucpUtils";

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

export default function AlumnoHorario() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [horario, setHorario] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ dia_semana: "Lunes", hora_inicio: "", hora_fin: "", materia: "", periodo: "Agosto–Diciembre 2026" });

  const load = async () => {
    if (!user?.id) return;
    try {
      const h = await base44.entities.Horarios_Clase.filter({ usuario: user.id }, "dia_semana", 50);
      setHorario(h);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const handleAdd = async () => {
    if (!form.hora_inicio || !form.hora_fin) { toast({ title: "Completa las horas", variant: "destructive" }); return; }
    try {
      await base44.entities.Horarios_Clase.create({ ...form, usuario: user.id, es_clase: true });
      toast({ title: "Clase agregada" });
      setShowForm(false);
      setForm({ ...form, hora_inicio: "", hora_fin: "", materia: "" });
      load();
    } catch (e) { toast({ title: "Error al agregar", variant: "destructive" }); }
  };

  const handleDelete = async (id) => {
    await base44.entities.Horarios_Clase.delete(id);
    toast({ title: "Clase eliminada" });
    load();
  };

  const grouped = DIAS.map(d => ({ dia: d, items: horario.filter(h => h.dia_semana === d) }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Mi horario de clases</h1>
          <p className="text-sm text-muted-foreground mt-1">Opcional — nos ayuda a coordinar tu disponibilidad</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" /> Agregar clase
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">Registrar tu horario es <strong>opcional</strong>. Nos ayuda a saber cuándo podrías estar disponible en UCP. Los fines de semana no son laborables.</p>
      </div>

      {showForm && (
        <SectionCard title="Nueva clase">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="mb-1.5 block">Día</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.dia_semana} onChange={(e) => setForm({ ...form, dia_semana: e.target.value })}>
                {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Hora inicio</Label>
              <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Hora fin</Label>
              <Input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Materia</Label>
              <Input value={form.materia} onChange={(e) => setForm({ ...form, materia: e.target.value })} placeholder="Ej. Matemáticas" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleAdd}>Guardar clase</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {loading ? (
        <div className="py-6"><ListaSkeleton filas={3} /></div>
      ) : horario.length === 0 ? (
        <SectionCard>
          <EmptyState title="Sin clases registradas" message="Agrega tu horario de clases para que UCP sepa tu disponibilidad." icon={Calendar} action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-2" /> Agregar clase</Button>} />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {grouped.filter(g => g.items.length > 0).map((g) => (
            <SectionCard key={g.dia} title={g.dia} subtitle={`${g.items.length} clase(s)`}>
              <div className="space-y-2">
                {g.items.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-sm">{h.materia || "Clase"}</p>
                      <p className="text-xs text-muted-foreground">{h.hora_inicio} – {h.hora_fin} · {calcularHoras(h.hora_inicio, h.hora_fin)}h</p>
                    </div>
                    <button onClick={() => handleDelete(h.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}