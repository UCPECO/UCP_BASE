import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { QrCode, Plus, Power, Download, Copy, Trash2, Printer, AlertTriangle } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { confirmarGlobal } from "@/components/ucp/ConfirmDialog";
import { AREAS, labelArea } from "@/lib/areas";

// Token aleatorio criptográficamente seguro: identifica al QR ante el servidor.
// El área NO viaja en el QR; el servidor la resuelve desde la BD, así un QR
// desactivado o eliminado deja de funcionar aunque alguien lo tenga impreso.
function generarToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function urlDeFichaje(token) {
  return `${window.location.origin}/fichar?t=${token}`;
}

// Dibuja el QR localmente en un canvas (sin servicios externos)
function QrCanvas({ text, size = 160 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && text) {
      QRCode.toCanvas(ref.current, text, { width: size, margin: 1, errorCorrectionLevel: "M" }).catch(() => {});
    }
  }, [text, size]);
  return <canvas ref={ref} className="rounded-lg" style={{ width: size, height: size }} />;
}

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
    const token = generarToken();
    const url = urlDeFichaje(token);
    await base44.entities.Codigos_QR.create({
      nombre: `QR - ${area}`,
      tipo: "por_area",
      token,
      url,
      ubicacion: area,
      fecha_expiracion: expiracion || null,
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
    } catch (e) { toast({ title: "Error al crear el QR", description: e.message, variant: "destructive" }); }
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
    } catch (e) { toast({ title: "Error al generar", description: e.message, variant: "destructive" }); }
    finally { setGenerandoTodas(false); }
  };

  const toggleActivo = async (c) => {
    await base44.entities.Codigos_QR.update(c.id, { activo: !c.activo });
    toast({ title: c.activo ? "QR desactivado" : "QR activado" });
    load();
  };

  const eliminarQr = async (c) => {
    if (!(await confirmarGlobal({ titulo: `¿Eliminar el QR de "${labelArea(c.ubicacion) || c.ubicacion}"?`, descripcion: "Si ya lo imprimiste, ese código dejará de funcionar para fichar.", destructivo: true }))) return;
    try {
      await base44.entities.Codigos_QR.delete(c.id);
      toast({ title: "QR eliminado", description: labelArea(c.ubicacion) || c.ubicacion });
      load();
    } catch (e) {
      toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    }
  };

  const copiarUrl = (url) => {
    navigator.clipboard.writeText(url);
    toast({ title: "URL copiada" });
  };

  // Descarga el canvas del QR como PNG (todo local)
  const descargarPng = (c) => {
    const canvas = document.getElementById(`qr-canvas-${c.id}`);
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${(c.ubicacion || "area").toLowerCase().replace(/\s+/g, "-")}.png`;
    a.click();
  };

  // Hoja imprimible con el QR grande y el nombre del área
  const imprimirQr = (c) => {
    const canvas = document.getElementById(`qr-canvas-${c.id}`);
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const area = labelArea(c.ubicacion) || c.ubicacion || "Área";
    const w = window.open("", "_blank", "width=420,height=620");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>QR ${area}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#0f172a}
      h1{font-size:22px;margin:16px 0 4px}p{color:#64748b;font-size:13px;margin:4px 0}
      img{width:320px;height:320px;margin-top:12px}</style></head>
      <body><h1>${area}</h1><p>Escanea este código para registrar tu entrada y salida</p>
      <img src="${dataUrl}" alt="QR ${area}"/>
      <p>UCP · Control de horas</p>
      <script>window.onload=()=>{window.print();}<\/script></body></html>`);
    w.document.close();
  };

  const expirado = (c) => c.fecha_expiracion && c.fecha_expiracion < new Date().toISOString().slice(0, 10);
  const esLegacy = (c) => !c.token;

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

      {/* Aviso si quedan códigos del sistema anterior */}
      {codigos.some(esLegacy) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Hay códigos del sistema anterior</p>
            <p className="text-amber-800">Los códigos marcados como "sistema anterior" ya no sirven para fichar (quedaron desactivados). Bórralos y genera los nuevos con el botón <b>QR de todas las áreas</b>, luego imprime y coloca los nuevos.</p>
          </div>
        </div>
      )}

      {showForm && (
        <SectionCard title="Nuevo código QR" subtitle="El QR se coloca impreso en el área. Al escanearlo, el usuario registra su entrada o salida automáticamente">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <Label className="mb-1.5 block">Área *</Label>
              <select className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}>
                <option value="">Selecciona un área...</option>
                {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="mb-1.5 block">Expiración (opcional)</Label>
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
            <div key={c.id} className={`bg-card rounded-2xl border shadow-sm p-5 text-center ${esLegacy(c) ? "border-amber-300 opacity-70" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3 gap-2">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  esLegacy(c) ? "bg-amber-100 text-amber-700"
                  : expirado(c) ? "bg-rose-100 text-rose-700"
                  : c.activo ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500"}`}>
                  {esLegacy(c) ? "Sistema anterior" : expirado(c) ? "Expirado" : c.activo ? "Activo" : "Inactivo"}
                </span>
                <span className="text-xs text-muted-foreground capitalize">{c.tipo?.replace(/_/g, " ") || "qr"}</span>
              </div>
              {c.url && !esLegacy(c) ? (
                <div className="inline-block p-2 bg-white rounded-xl border border-border">
                  <QrCanvas text={c.url} size={160} />
                  {/* canvas con id para descargar/imprimir */}
                  <div className="hidden"><QrCanvasHidden id={`qr-canvas-${c.id}`} text={c.url} /></div>
                </div>
              ) : (
                <div className="h-[176px] flex items-center justify-center text-xs text-muted-foreground bg-muted/40 rounded-xl">
                  Sin imagen (código anterior)
                </div>
              )}
              <p className="font-semibold mt-3">{labelArea(c.ubicacion) || c.ubicacion || "Sin área"}</p>
              <p className="text-xs text-muted-foreground mt-1">Expira: {c.fecha_expiracion ? new Date(c.fecha_expiracion + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "Sin expiración"}</p>
              <p className="text-xs text-muted-foreground mt-1">{c.escaneos || 0} escaneos</p>
              <div className="flex justify-center gap-2 mt-3">
                {!esLegacy(c) && (
                  <>
                    <button onClick={() => copiarUrl(c.url)} className="p-2 hover:bg-muted rounded-lg" title="Copiar URL"><Copy className="h-4 w-4" /></button>
                    <button onClick={() => descargarPng(c)} className="p-2 hover:bg-muted rounded-lg" title="Descargar PNG"><Download className="h-4 w-4" /></button>
                    <button onClick={() => imprimirQr(c)} className="p-2 hover:bg-muted rounded-lg" title="Imprimir"><Printer className="h-4 w-4" /></button>
                  </>
                )}
                <button onClick={() => toggleActivo(c)} className="p-2 hover:bg-muted rounded-lg" title="Activar/Desactivar"><Power className="h-4 w-4" /></button>
                <button onClick={() => eliminarQr(c)} className="p-2 hover:bg-rose-50 text-rose-600 rounded-lg" title="Eliminar QR"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Canvas oculto en alta resolución para descargar/imprimir
function QrCanvasHidden({ id, text }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && text) {
      QRCode.toCanvas(ref.current, text, { width: 512, margin: 2, errorCorrectionLevel: "M" }).catch(() => {});
    }
  }, [text]);
  return <canvas id={id} ref={ref} width={512} height={512} />;
}
