import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { UserCircle, Save, Camera, FileDown } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Image as ImageIcon } from "lucide-react";
import { generarReportePdfMensual } from "@/lib/generarReporte";
import HistorialFichajes from "@/components/ucp/HistorialFichajes";
import { ListaSkeleton } from "@/components/ucp/Skeleton";
import { comprimirImagen } from "@/lib/imagen";

const TIPOS = ["servicio_social", "voluntario", "practicas_profesionales", "residente", "practicante"];

export default function AlumnoPerfil() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [perfil, setPerfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [mesReporte, setMesReporte] = useState(new Date().getMonth());

  useEffect(() => {
    base44.auth.me().then((me) => {
      setPerfil(me);
      setForm({
        nombre_completo: me.nombre_completo || me.full_name || "",
        telefono: me.telefono || "",
        matricula: me.matricula || "",
        facultad: me.facultad || "",
        carrera: me.carrera || "",
        semestre: me.semestre || "",
        tipo_participante: me.tipo_participante || "",
        institucion_origen: me.institucion_origen || "",
        periodo_asignado: me.periodo_asignado || "",
        fecha_ingreso_ucp: me.fecha_ingreso_ucp || "",
      });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleReportePdf = async () => {
    setGenerandoPdf(true);
    try {
      const userId = user?.id;
      const [asigs, regs, bons] = await Promise.all([
        base44.entities.Asignaciones.filter({ usuario: userId }, "-created_date", 50),
        base44.entities.Registros_QR.filter({ usuario: userId }, "-fecha", 200),
        base44.entities.Bonos.filter({ usuario: userId }, "-fecha", 100),
      ]);
      const activa = asigs.find(a => a.estado === "activo") || asigs[0];
      let actividad = null;
      if (activa?.actividad) {
        try { actividad = await base44.entities.Actividades.get(activa.actividad); } catch {}
      }
      generarReportePdfMensual({
        perfil: { ...perfil, ...form },
        actividad,
        registros: regs,
        bonos: bons,
        mes: mesReporte,
        anio: new Date().getFullYear(),
      });
      toast({ title: "Reporte PDF generado" });
    } catch (e) {
      toast({ title: "Error al generar reporte", variant: "destructive" });
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      // La foto se comprime y se guarda directamente en la BD (no hay storage de archivos)
      const dataUrl = await comprimirImagen(file, 640, 0.8);
      await base44.auth.updateMe({ foto_perfil: dataUrl });
      setPerfil((p) => ({ ...p, foto_perfil: dataUrl }));
      toast({ title: "Foto actualizada" });
    } catch (err) {
      toast({ title: "Error al subir foto", variant: "destructive" });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(form);
      toast({ title: "Perfil guardado correctamente" });
    } catch (err) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="py-6"><ListaSkeleton filas={4} /></div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Mi perfil</h1>
        <p className="text-sm text-muted-foreground mt-1">Mantén tus datos actualizados</p>
      </div>

      {/* Foto */}
      <SectionCard title="Foto de perfil">
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center">
            {perfil?.foto_perfil ? (
              <img src={perfil.foto_perfil} alt="perfil" className="h-full w-full object-cover" />
            ) : (
              <UserCircle className="h-10 w-10 text-muted-foreground" />
            )}
          </div>
          <div>
            <Label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 transition-colors">
                <Camera className="h-4 w-4" /> Cambiar foto
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </Label>
            <p className="text-xs text-muted-foreground mt-2">PNG o JPG, máximo 5MB</p>
          </div>
        </div>
      </SectionCard>

      {/* Datos */}
      <SectionCard title="Datos personales" action={
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" /> {saving ? "Guardando..." : "Guardar"}
        </Button>
      }>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre completo" value={form.nombre_completo || ""} onChange={(v) => setForm({ ...form, nombre_completo: v })} />
          <Field label="Correo" value={user?.email || perfil?.email || ""} disabled />
          <Field label="Teléfono" value={form.telefono || ""} onChange={(v) => setForm({ ...form, telefono: v })} />
          <Field label="Matrícula" value={form.matricula || ""} onChange={(v) => setForm({ ...form, matricula: v })} />
          <Field label="Facultad" value={form.facultad || ""} onChange={(v) => setForm({ ...form, facultad: v })} />
          <Field label="Carrera" value={form.carrera || ""} onChange={(v) => setForm({ ...form, carrera: v })} />
          <Field label="Semestre" type="number" value={form.semestre || ""} onChange={(v) => setForm({ ...form, semestre: Number(v) })} />
          <div>
            <Label className="mb-1.5 block">Tipo de participante</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={form.tipo_participante || ""}
              onChange={(e) => setForm({ ...form, tipo_participante: e.target.value })}
            >
              <option value="">Selecciona...</option>
              {TIPOS.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <Field label="Institución de origen" value={form.institucion_origen || ""} onChange={(v) => setForm({ ...form, institucion_origen: v })} />
          <Field label="Período asignado" value={form.periodo_asignado || ""} onChange={(v) => setForm({ ...form, periodo_asignado: v })} />
          <Field label="Fecha de ingreso UCP" type="date" value={form.fecha_ingreso_ucp || ""} onChange={(v) => setForm({ ...form, fecha_ingreso_ucp: v })} />
        </div>
      </SectionCard>

      {/* Reporte PDF mensual */}
      <SectionCard title="Reporte mensual PDF" subtitle="Descarga un resumen de tus horas y actividades del mes">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div>
            <Label className="mb-1.5 block">Mes del reporte</Label>
            <select
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={mesReporte}
              onChange={(e) => setMesReporte(Number(e.target.value))}
            >
              {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          </div>
          <Button onClick={handleReportePdf} disabled={generandoPdf}>
            <FileDown className="h-4 w-4 mr-2" /> {generandoPdf ? "Generando..." : "Descargar PDF"}
          </Button>
        </div>
      </SectionCard>

      <HistorialFichajes />
    </div>
  );
}

function Field({ label, value, onChange, disabled, type = "text" }) {
  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <Input type={type} value={value} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} />
    </div>
  );
}