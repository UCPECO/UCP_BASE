import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Settings, Save } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function AdminConfig() {
  const { toast } = useToast();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ hora_apertura: "08:00", hora_cierre: "18:00", tiempo_minimo_registro: 30, dias_laborales: "Lunes,Martes,Miércoles,Jueves,Viernes", periodo_actual: "Agosto–Diciembre 2026" });

  useEffect(() => {
    (async () => {
      try {
        const all = await base44.entities.Configuracion_Sistema.list("created_date", 10);
        if (all.length > 0) {
          setConfig(all[0]);
          setForm({
            hora_apertura: all[0].hora_apertura,
            hora_cierre: all[0].hora_cierre,
            tiempo_minimo_registro: all[0].tiempo_minimo_registro,
            dias_laborales: all[0].dias_laborales,
            periodo_actual: all[0].periodo_actual,
          });
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config) {
        await base44.entities.Configuracion_Sistema.update(config.id, form);
      } else {
        await base44.entities.Configuracion_Sistema.create(form);
      }
      toast({ title: "Configuración guardada" });
    } catch (e) { toast({ title: "Error al guardar", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Configuración del sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">Parámetros generales de UCP</p>
      </div>

      <SectionCard title="Parámetros operativos" icon={Settings} action={
        <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? "Guardando..." : "Guardar"}</Button>
      }>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-1.5 block">Hora de apertura</Label>
            <Input type="time" value={form.hora_apertura} onChange={(e) => setForm({ ...form, hora_apertura: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Hora de cierre</Label>
            <Input type="time" value={form.hora_cierre} onChange={(e) => setForm({ ...form, hora_cierre: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Tiempo mínimo de registro (min)</Label>
            <Input type="number" value={form.tiempo_minimo_registro} onChange={(e) => setForm({ ...form, tiempo_minimo_registro: Number(e.target.value) })} />
          </div>
          <div>
            <Label className="mb-1.5 block">Período actual</Label>
            <Input value={form.periodo_actual} onChange={(e) => setForm({ ...form, periodo_actual: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="mb-1.5 block">Días laborales</Label>
            <Input value={form.dias_laborales} onChange={(e) => setForm({ ...form, dias_laborales: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Separados por comas</p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}