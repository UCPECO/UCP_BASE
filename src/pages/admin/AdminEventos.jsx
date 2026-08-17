import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CalendarDays, Plus, Pencil, Trash2, MapPin, Clock } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha } from "@/lib/ucpUtils";

const TIPOS = ["capacitacion", "junta", "actividad_especial", "dia_festivo", "taller", "visita", "otro"];
const COLORES = ["azul", "verde", "rojo", "amarillo", "morado", "naranja"];
const VISIBLE = ["todos", "servicio_social", "voluntarios", "encargados", "admin"];
const COLOR_DOT = { azul: "bg-blue-500", verde: "bg-emerald-500", rojo: "bg-rose-500", amarillo: "bg-amber-500", morado: "bg-purple-500", naranja: "bg-orange-500" };

export default function AdminEventos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ titulo: "", descripcion: "", tipo_evento: "capacitacion", fecha: "", hora_inicio: "", hora_fin: "", ubicacion: "", es_todo_el_dia: false, color: "azul", visible_para: "todos" });

  const load = async () => {
    try { setEventos(await base44.entities.Eventos.list("fecha", 100)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!form.titulo || !form.fecha) { toast({ title: "Título y fecha requeridos", variant: "destructive" }); return; }
    try {
      if (editId) {
        await base44.entities.Eventos.update(editId, form);
        toast({ title: "Evento actualizado" });
      } else {
        await base44.entities.Eventos.create({ ...form, creado_por: user.id });
        toast({ title: "Evento creado" });
      }
      setShowForm(false); setEditId(null);
      setForm({ titulo: "", descripcion: "", tipo_evento: "capacitacion", fecha: "", hora_inicio: "", hora_fin: "", ubicacion: "", es_todo_el_dia: false, color: "azul", visible_para: "todos" });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const handleEdit = (ev) => {
    setEditId(ev.id);
    setForm({ titulo: ev.titulo, descripcion: ev.descripcion || "", tipo_evento: ev.tipo_evento, fecha: ev.fecha, hora_inicio: ev.hora_inicio || "", hora_fin: ev.hora_fin || "", ubicacion: ev.ubicacion || "", es_todo_el_dia: ev.es_todo_el_dia, color: ev.color, visible_para: ev.visible_para });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar evento?")) return;
    await base44.entities.Eventos.delete(id);
    toast({ title: "Evento eliminado" });
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Eventos UCP</h1>
          <p className="text-sm text-muted-foreground mt-1">{eventos.length} evento(s)</p>
        </div>
        <Button onClick={() => { setEditId(null); setForm({ titulo: "", descripcion: "", tipo_evento: "capacitacion", fecha: "", hora_inicio: "", hora_fin: "", ubicacion: "", es_todo_el_dia: false, color: "azul", visible_para: "todos" }); setShowForm(!showForm); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuevo evento
        </Button>
      </div>

      {showForm && (
        <SectionCard title={editId ? "Editar evento" : "Nuevo evento"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Título *</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Tipo</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.tipo_evento} onChange={(e) => setForm({ ...form, tipo_evento: e.target.value })}>
                {TIPOS.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Visible para</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.visible_para} onChange={(e) => setForm({ ...form, visible_para: e.target.value })}>
                {VISIBLE.map(v => <option key={v} value={v}>{v.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Fecha *</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Color</Label>
              <div className="flex gap-2 pt-2">
                {COLORES.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })} className={`h-7 w-7 rounded-full ${COLOR_DOT[c]} ${form.color === c ? "ring-2 ring-offset-2 ring-foreground" : ""}`} />
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Hora inicio</Label>
              <Input type="time" value={form.hora_inicio} onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Hora fin</Label>
              <Input type="time" value={form.hora_fin} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Ubicación</Label>
              <Input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Descripción</Label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit}>{editId ? "Guardar" : "Crear evento"}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {eventos.length === 0 ? (
        <SectionCard><EmptyState title="Sin eventos" message="Crea el primer evento." icon={CalendarDays} /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {eventos.map((ev) => (
            <div key={ev.id} className="bg-card rounded-2xl border border-border shadow-sm p-5">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${COLOR_DOT[ev.color]}`} />
                  <span className="text-xs font-medium text-muted-foreground capitalize">{ev.tipo_evento?.replace(/_/g, " ")}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleEdit(ev)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="h-3.5 w-3.5 text-blue-600" /></button>
                  <button onClick={() => handleDelete(ev.id)} className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="h-3.5 w-3.5 text-rose-600" /></button>
                </div>
              </div>
              <p className="font-semibold">{ev.titulo}</p>
              <p className="text-xs text-muted-foreground mt-1">{formatearFecha(ev.fecha)}</p>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {ev.hora_inicio} – {ev.hora_fin}</span>
                {ev.ubicacion && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.ubicacion}</span>}
              </div>
              <span className="inline-block mt-2 text-xs px-2 py-0.5 rounded-full bg-muted capitalize">Visible: {ev.visible_para?.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}