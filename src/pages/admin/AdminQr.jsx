import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { QrCode, Plus, Power, Download, Copy } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { generarQrUrl } from "@/lib/ucpUtils";
import { AREAS, labelArea } from "@/lib/areas";

export default function AdminQr() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [codigos, setCodigos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ubicacion: "", fecha_expiracion: "" });
  const [generandoTodas, setGenerandoTodas] = useState(false);

  const load = async () => {
    try {
      const cods = await base44.entities.Codigos_QR.list("-created_date", 100);
      setCodigos(cods);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const crearQrArea = async (area, expiracion = "") => {
    const url = `${window.location.origin}/fichar?area=${encodeURIComponent(area)}${expiracion ? `&exp=${expiracion}` : ""}`;
    await base44.entities.Codigos_QR.create({
      nombre: `QR - ${area}`,
      tipo: "por_area",
      url,
      ubicacion: area,
      fecha_expiracion: expiracion,
      creado_por: user.id,
      activo: true,
      escaneos: 0,
    });
  };

  const handleSubmit = async () => {
    if (!form.ubicacion) { toast({ title: "El área es requerida", variant: "destructive" }); return; }
    try {
      await crearQrArea(form.ubicacion, form.fecha_expiracion);
      toast({ title: "Código QR creado", description: labelArea(form.ubicacion) });
      setShowForm(false);
      setForm({ ubicacion: "", fecha_expiracion: "" });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  // Crea de una vez los QR de las áreas que aún no tienen uno activo
  const generarTodasLasAreas = async () => {
    const conActivo = new Set(codigos.filter((c) => c.activo).map((c) => c.ubicacion));
    const faltantes = AREAS.filter((a) => !conActivo.has(a.value));
    if (faltantes.length === 0) { toast({ title: "Ya existe un QR activo para cada área" }); return; }
    setGenerandoTodas(true);
    try {
      for (const a of faltantes) await crearQrArea(a.value);
      toast({ title: `${faltantes.length} código(s) QR creado(s)`, description: faltantes.map((a) => a.label).join(" · ") });
      load();
    } catch (e) { toast({ title: "Error al generar", variant: "destructive" }); }
    finally { setGenerandoTodas(false); }
  };

  const toggleActivo = async (c) => {
    await base44.entities.Codigos_QR.update(c.id, { activo: !c.activo });
    toast({ title: c.activo ? "QR desactivado" : "QR activado" });
    load();
  };

  const copiarUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiada" });
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Códigos QR</h1>
          <p className="text-sm text-muted-foreground mt-1">{codigos.length} código(s) · {codigos.filter(c => c.activo).length} activos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" disabled={generandoTodas} onClick={generarTodasLasAreas}>
            <QrCode className="h-4 w-4 mr-2" /> {generandoTodas ? "Generando..." : "QR de todas las áreas"}
          </Button>
          <Button onClick={() => setShowForm(!showForm)}><Plus className="h-4 w-4 mr-2" /> Nuevo QR</Button>
        </div>
      </div>

      {showForm && (
        <SectionCard title="Nuevo código QR" subtitle="Un QR por área: al escanearlo con la cámara del teléfono se ficha la entrada o salida automáticamente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <Label className="mb-1.5 block">Área *</Label>
              <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}>
                <option value="">Selecciona un área...</option>
                {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Expiración</Label>
              <Input type="date" value={form.fecha_expiracion} onChange={(e) => setForm({ ...form, fecha_expiracion: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit}><Plus className="h-4 w-4 mr-2" /> Crear QR</Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {codigos.length === 0 ? (
        <SectionCard><EmptyState title="Sin códigos QR" message="Crea el primer código QR para fichaje." icon={QrCode} /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {codigos.map((c) => (
            <div key={c.id} className="bg-card rounded-2xl border border-border shadow-sm p-5 text-center">
              <div className="flex items-center justify-between mb-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {c.activo ? "Activo" : "Inactivo"}
                </span>
                <span className="text-xs text-muted-foreground capitalize">{c.tipo?.replace(/_/g, " ")}</span>
              </div>
              <div className="inline-block p-2 bg-white rounded-xl border border-border">
                <img src={generarQrUrl(c.url)} alt={c.ubicacion} className="h-32 w-32" />
              </div>
              <p className="font-semibold mt-3">{labelArea(c.ubicacion) || "Sin área"}</p>
              <p className="text-xs text-muted-foreground mt-1">Expira: {c.fecha_expiracion ? new Date(c.fecha_expiracion + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Sin expiración"}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.escaneos || 0} escaneos</p>
              <div className="flex justify-center gap-2 mt-3">
                <button onClick={() => copiarUrl(c.url)} className="p-2 hover:bg-muted rounded-lg" title="Copiar URL"><Copy className="h-4 w-4" /></button>
                <a href={generarQrUrl(c.url)} download className="p-2 hover:bg-muted rounded-lg" title="Descargar"><Download className="h-4 w-4" /></a>
                <button onClick={() => toggleActivo(c)} className="p-2 hover:bg-muted rounded-lg" title="Activar/Desactivar"><Power className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}