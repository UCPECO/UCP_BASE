import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { AlertTriangle, Plus } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha } from "@/lib/ucpUtils";
import { esParticipante } from "@/lib/roles";

const TIPOS = ["falta", "retardo", "incumplimiento", "accidente", "queja", "solicitud", "otro"];
const PRIORIDADES = ["baja", "media", "alta", "urgente"];

export default function EncargadoIncidencias() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [incidencias, setIncidencias] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo_incidencia: "falta", usuario_afectado: "", asignacion: "", descripcion: "", prioridad: "media" });

  const load = async () => {
    try {
      const [incs, resp] = await Promise.all([
        base44.entities.Incidencias.list("-created_date", 500),
        base44.functions.invoke("ObtenerPersonalCompleto", {}),
      ]);
      setIncidencias(incs);
      setUsers(resp.data?.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const participantes = users.filter((u) => esParticipante(u.role));
  const nombreDe = (id) => {
    const u = users.find((x) => x.id === id);
    return u?.nombre_completo || u?.full_name || "—";
  };

  const handleSubmit = async () => {
    if (!form.descripcion || !form.usuario_afectado) { toast({ title: "Completa los campos", variant: "destructive" }); return; }
    try {
      await base44.entities.Incidencias.create({ ...form, creado_por: user.id, estado_incidencia: "reportada" });
      toast({ title: "Incidencia reportada" });
      setShowForm(false);
      setForm({ tipo_incidencia: "falta", usuario_afectado: "", asignacion: "", descripcion: "", prioridad: "media" });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Incidencias</h1>
          <p className="text-sm text-muted-foreground mt-1">{incidencias.length} incidencia(s) en todo el personal</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4 mr-2" /> Reportar incidencia</Button>
      </div>

      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/8 border border-primary/20 text-foreground text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Como encargado puedes <b>reportar incidencias</b> y ver las de <b>todo el personal</b>.
          La <b>resolución y cambio de estado</b> de incidencias, así como la edición de horas, quedan reservadas al <b>administrador</b>.
        </span>
      </div>

      {showForm && (
        <SectionCard title="Nueva incidencia">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block">Tipo</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.tipo_incidencia} onChange={(e) => setForm({ ...form, tipo_incidencia: e.target.value })}>
                {TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Prioridad</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}>
                {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Persona afectada</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.usuario_afectado} onChange={(e) => setForm({ ...form, usuario_afectado: e.target.value })}>
                <option value="">Selecciona...</option>
                {participantes.map((a) => <option key={a.id} value={a.id}>{a.nombre_completo || a.full_name}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label className="mb-1.5 block">Descripción *</Label>
            <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} placeholder="Describe la incidencia..." />
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit}>Reportar</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {incidencias.length === 0 ? (
        <SectionCard><EmptyState title="Sin incidencias" message="No hay incidencias reportadas." icon={AlertTriangle} /></SectionCard>
      ) : (
        <div className="space-y-3">
          {incidencias.map((inc) => (
            <div key={inc.id} className="bg-card rounded-2xl border border-border shadow-sm p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 capitalize">{inc.tipo_incidencia}</span>
                  <StatusBadge status={inc.prioridad} type="prioridad" />
                </div>
                <StatusBadge status={inc.estado_incidencia} />
              </div>
              <p className="text-sm font-medium">{nombreDe(inc.usuario_afectado)}</p>
              {inc.descripcion && <p className="text-sm text-muted-foreground mt-1">{inc.descripcion}</p>}
              <p className="text-xs text-muted-foreground mt-2">{formatearFecha(inc.created_date)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}