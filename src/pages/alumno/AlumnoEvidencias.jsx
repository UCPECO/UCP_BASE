import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Image, Plus, Upload, Link as LinkIcon, Pencil, X } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import ComentariosEvidencia from "@/components/ucp/ComentariosEvidencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatearFecha } from "@/lib/ucpUtils";
import { AREAS } from "@/lib/areas";
import { comprimirImagen } from "@/lib/imagen";

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
  const [imagenData, setImagenData] = useState(""); // data URL comprimida
  const [procesandoImg, setProcesandoImg] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [detalle, setDetalle] = useState(null); // evidencia abierta en el diálogo

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
    setImagenData("");
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
    setLinkUrl(ev.tipo_evidencia === "link" ? (ev.archivo_url || "") : "");
    setImagenData(ev.tipo_evidencia === "foto" ? (ev.archivo_url || "") : "");
    setShowForm(true);
  };

  // Comprime la imagen apenas se selecciona y muestra vista previa
  const onSelectFile = async (file) => {
    if (!file) return;
    setProcesandoImg(true);
    try {
      const dataUrl = await comprimirImagen(file);
      setImagenData(dataUrl);
    } catch (e) {
      toast({ title: "El archivo no es una imagen válida", variant: "destructive" });
    } finally {
      setProcesandoImg(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.descripcion || !form.actividad) {
      toast({ title: "Completa actividad y descripción", variant: "destructive" });
      return;
    }

    let archivoValue;
    if (form.tipo_evidencia === "foto") {
      if (!imagenData) {
        toast({ title: "Selecciona una imagen", variant: "destructive" });
        return;
      }
      archivoValue = imagenData;
    } else {
      if (!linkUrl || !/^https?:\/\//i.test(linkUrl)) {
        toast({ title: "Pega un enlace válido (https://…)", variant: "destructive" });
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
        archivo_url: archivoValue,
      };

      if (editingId) {
        await base44.entities.Evidencias.update(editingId, payload);
        toast({ title: "Evidencia corregida y reenviada a revisión" });
      } else {
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
          <p className="text-sm text-muted-foreground mt-1">Sube imágenes o enlaces de tu servicio. Toca una tarjeta para verla y comentar.</p>
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
              <div className="space-y-3">
                <Label className="mb-1.5 block">Imagen *</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <Label className="cursor-pointer">
                    <span className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80">
                      <Upload className="h-4 w-4" /> {procesandoImg ? "Procesando…" : imagenData ? "Cambiar imagen" : "Seleccionar imagen"}
                    </span>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => onSelectFile(e.target.files?.[0])} />
                  </Label>
                  {imagenData && (
                    <button type="button" onClick={() => setImagenData("")} className="text-xs text-rose-600 hover:underline inline-flex items-center gap-1">
                      <X className="h-3 w-3" /> Quitar
                    </button>
                  )}
                </div>
                {imagenData && (
                  <img src={imagenData} alt="Vista previa" className="max-h-56 rounded-xl border border-border object-cover" />
                )}
                <p className="text-xs text-muted-foreground">La imagen se comprime automáticamente antes de enviarse.</p>
              </div>
            ) : (
              <div>
                <Label className="mb-1.5 block">Enlace *</Label>
                <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving || procesandoImg}>{saving ? "Guardando..." : editingId ? "Reenviar evidencia" : "Enviar evidencia"}</Button>
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
              <div key={ev.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setDetalle(ev)}>
                <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                  {ev.tipo_evidencia === "foto" && ev.archivo_url ? (
                    <img src={ev.archivo_url} alt={ev.descripcion} className="h-full w-full object-cover" />
                  ) : ev.tipo_evidencia === "link" && ev.archivo_url ? (
                    <div className="flex flex-col items-center gap-2 text-primary">
                      <LinkIcon className="h-10 w-10" />
                      <span className="text-xs">Enlace adjunto</span>
                    </div>
                  ) : (
                    <TipoIcon className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground capitalize flex items-center gap-1"><TipoIcon className="h-3 w-3" /> {ev.tipo_evidencia === "foto" ? "imagen" : "enlace"}</span>
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
                    <Button size="sm" variant="outline" className="mt-3" onClick={(e) => { e.stopPropagation(); openEdit(ev); }}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Corregir y reenviar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalle: imagen grande / enlace + hilo de comentarios */}
      <Dialog open={!!detalle} onOpenChange={(open) => !open && setDetalle(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  Detalle de evidencia <StatusBadge status={detalle.estado_evidencia} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {detalle.tipo_evidencia === "foto" && detalle.archivo_url ? (
                  <a href={detalle.archivo_url} target="_blank" rel="noreferrer">
                    <img src={detalle.archivo_url} alt={detalle.descripcion} className="w-full max-h-[50vh] object-contain rounded-xl bg-muted" />
                  </a>
                ) : detalle.tipo_evidencia === "link" && detalle.archivo_url ? (
                  <a href={detalle.archivo_url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20 text-primary text-sm font-medium hover:underline break-all">
                    <LinkIcon className="h-4 w-4 shrink-0" /> {detalle.archivo_url}
                  </a>
                ) : (
                  <div className="p-6 rounded-xl bg-muted text-center text-sm text-muted-foreground">Sin archivo adjunto</div>
                )}
                <div>
                  <p className="text-sm font-medium">{detalle.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatearFecha(detalle.fecha_captura || detalle.created_date)}
                    {detalle.ubicacion_gps ? ` · ${detalle.ubicacion_gps}` : ""}
                  </p>
                </div>
                {detalle.comentario_revision && (
                  <p className={`text-xs p-2 rounded-lg ${detalle.estado_evidencia === "regresada" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-600"}`}>
                    {detalle.estado_evidencia === "regresada" ? "Corrección pedida: " : "Revisión: "}{detalle.comentario_revision}
                  </p>
                )}
                {detalle.estado_evidencia === "regresada" && (
                  <Button size="sm" variant="outline" onClick={() => { setDetalle(null); openEdit(detalle); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Corregir y reenviar
                  </Button>
                )}
                <ComentariosEvidencia evidenciaId={detalle.id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
