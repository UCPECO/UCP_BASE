import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Image, Plus, Upload, Link as LinkIcon, Pencil } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha } from "@/lib/ucpUtils";
import { AREAS } from "@/lib/areas";

const TIPOS = [
  { value: "foto", label: "Imagen", icon: Image },
  { value: "link", label: "Enlace", icon: LinkIcon },
];

export default function AlumnoEvidencias() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [evidencias, setEvidencias] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ tipo_evidencia: "foto", descripcion: "", fecha_captura: "", ubicacion_gps: "", actividad: "" });
  const [areaSel, setAreaSel] = useState("");
  const [file, setFile] = useState(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    try {
      const [evs, asigs, acts] = await Promise.all([
        base44.entities.Evidencias.filter({ usuario: user.id }, "-created_date", 50),
        base44.entities.Asignaciones.filter({ usuario: user.id }, "-created_date", 50),
        base44.entities.Actividades.list("nombre", 200),
      ]);
      setEvidencias(evs);
      setAsignaciones(asigs);
      setActividades(acts.filter((a) => a.activo));
      setAreaSel(user?.area_asignada || AREAS[0].value);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const actsDeArea = (area) => actividades.filter((a) => a.categoria === area);

  const resetForm = () => {
    setForm({ tipo_evidencia: "foto", descripcion: "", fecha_captura: "", ubicacion_gps: "", actividad: "" });
    setFile(null);
    setLinkUrl("");
    setEditingId(null);
  };

  const openNew = () => {
    resetForm();
    setAreaSel(user?.area_asignada || AREAS[0].value);
    setShowForm(true);
  };

  const openEdit = (ev) => {
    const act = actividades.find((a) => a.id === ev.actividad);
    setEditingId(ev.id);
    setForm({
      tipo_evidencia: ev.tipo_evidencia || "foto",
      descripcion: ev.descripcion || "",
      fecha_captura: ev.fecha_captura || "",
      ubicacion_gps: ev.ubicacion_gps || "",
      actividad: ev.actividad || "",
    });
    setAreaSel(act?.categoria || user?.area_asignada || AREAS[0].value);
    setLinkUrl(ev.tipo_evidencia === "link" ? (ev.archivo || "") : "");
    setFile(null);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.descripcion || !form.actividad) {
      toast({ title: "Completa actividad y descripción", variant: "destructive" });
      return;
    }

    let archivoValue = undefined;

    if (form.tipo_evidencia === "foto") {
      if (file) {
        setSaving(true);
        try {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          archivoValue = file_url;
        } catch (e) {
          toast({ title: "Error al subir imagen", variant: "destructive" });
          setSaving(false);
          return;
        }
      } else if (!editingId) {
        toast({ title: "Selecciona una imagen", variant: "destructive" });
        return;
      }
    } else {
      if (!linkUrl) {
        toast({ title: "Pega el enlace", variant: "destructive" });
        return;
      }
      archivoValue = linkUrl;
    }

    setSaving(true);
    try {
      const asig = asignaciones.find((a) => a.actividad === form.actividad && a.estado === "activo");
      const payload = {
        tipo_evidencia: form.tipo_evidencia,
        descripcion: form.descripcion,
        actividad: form.actividad,
        asignacion: asig?.id || "",
        fecha_captura: form.fecha_captura || new Date().toISOString().split("T")[0],
        ubicacion_gps: form.ubicacion_gps,
        estado_evidencia: "pendiente",
        comentario_revision: "",
      };
      if (archivoValue !== undefined) payload.archivo = archivoValue;

      if (editingId) {
        await base44.entities.Evidencias.update(editingId, payload);
        toast({ title: "Evidencia corregida y reenviada" });
      } else {
        payload.usuario = user.id;
        await base44.entities.Evidencias.create(payload);
        toast({ title: "Evidencia enviada para revisión" });
      }
      setShowForm(false);
      resetForm();
      load();
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Mis evidencias</h1>
          <p className="text-sm text-muted-foreground mt-1">Sube imágenes o enlaces de tu servicio</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Subir evidencia</Button>
      </div>

      {showForm && (
        <SectionCard title={editingId ? "Corregir evidencia" : "Nueva evidencia"}>
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS.map((t) => (
                  <button key={t.value} onClick={() => setForm({ ...form, tipo_evidencia: t.value })}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-colors ${form.tipo_evidencia === t.value ? "border-primary bg-primary/5" : "border-border"}`}>
                    <t.icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">Área *</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={areaSel} onChange={(e) => { setAreaSel(e.target.value); setForm({ ...form, actividad: "" }); }}>
                  {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div>
                <Label className="mb-1.5 block">Actividad *</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={form.actividad} onChange={(e) => setForm({ ...form, actividad: e.target.value })}>
                  <option value="">Selecciona…</option>
                  {actsDeArea(areaSel).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block">Descripción *</Label>
              <Input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Describe la evidencia" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">Fecha de captura</Label>
                <Input type="date" value={form.fecha_captura} onChange={(e) => setForm({ ...form, fecha_captura: e.target.value })} />
              </div>
              <div>
                <Label className="mb-1.5 block">Ubicación (opcional)</Label>
                <Input value={form.ubicacion_gps} onChange={(e) => setForm({ ...form, ubicacion_gps: e.target.value })} placeholder="Ej. Bodega UCP" />
              </div>
            </div>
            {form.tipo_evidencia === "foto" ? (
              <div>
                <Label className="mb-1.5 block">Imagen *</Label>
                <Label className="cursor-pointer">
                  <span className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80">
                    <Upload className="h-4 w-4" /> {file ? file.name : (editingId ? "Reemplazar imagen (opcional)" : "Seleccionar imagen")}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0])} />
                </Label>
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block">Enlace *</Label>
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving}>{saving ? "Guardando..." : editingId ? "Reenviar evidencia" : "Enviar evidencia"}</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
            </div>
          </div>
        </SectionCard>
      )}

      {evidencias.length === 0 ? (
        <SectionCard>
          <EmptyState title="Sin evidencias" message="Sube tu primera evidencia para que el encargado la revise." icon={Image} />
        </SectionCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {evidencias.map((ev) => {
            const TipoIcon = TIPOS.find((t) => t.value === ev.tipo_evidencia)?.icon || LinkIcon;
            return (
              <div key={ev.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="aspect-video bg-muted flex items-center justify-center">
                  {ev.tipo_evidencia === "foto" && ev.archivo ? (
                    <img src={ev.archivo} alt={ev.descripcion} className="h-full w-full object-cover" />
                  ) : ev.tipo_evidencia === "link" && ev.archivo ? (
                    <a href={ev.archivo} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-primary hover:underline">
                      <LinkIcon className="h-10 w-10" />
                      <span className="text-xs">Abrir enlace</span>
                    </a>
                  ) : (
                    <TipoIcon className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground capitalize flex items-center gap-1"><TipoIcon className="h-3 w-3" /> {ev.tipo_evidencia}</span>
                    <StatusBadge status={ev.estado_evidencia} />
                  </div>
                  <p className="text-sm font-medium line-clamp-2">{ev.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-2">{formatearFecha(ev.fecha_captura || ev.created_date)}</p>
                  {ev.bono_horas > 0 && (
                    <p className="text-xs mt-2 bg-emerald-50 text-emerald-700 p-2 rounded-lg font-medium">+{ev.bono_horas} h bono de cumplimiento</p>
                  )}
                  {ev.comentario_revision && (
                    <p className={`text-xs mt-2 p-2 rounded-lg ${ev.estado_evidencia === "regresada" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-600"}`}>
                      {ev.estado_evidencia === "regresada" ? "Corrige: " : "Revisión: "}{ev.comentario_revision}
                    </p>
                  )}
                  {ev.estado_evidencia === "regresada" && (
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => openEdit(ev)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Corregir y reenviar
                    </Button>
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