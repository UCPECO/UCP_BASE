import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Star, Loader2, Save, ClipboardCheck, History } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { registrarBitacora } from "@/lib/bitacora";
import { esParticipante } from "@/lib/roles";

const DIMENSIONES = [
  { key: "puntualidad", label: "Puntualidad" },
  { key: "actitud", label: "Actitud" },
  { key: "calidad_trabajo", label: "Calidad del trabajo" },
  { key: "cumplimiento", label: "Cumplimiento" },
  { key: "iniciativa", label: "Iniciativa" },
];

export default function EncargadoEvaluaciones() {
  const { toast } = useToast();
  const [perfil, setPerfil] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState("");
  const [form, setForm] = useState({ puntualidad: 3, actitud: 3, calidad_trabajo: 3, cumplimiento: 3, iniciativa: 3, comentario: "", periodo: "" });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    base44.auth.me().then(async (p) => {
      setPerfil(p);
      try {
        const res = await base44.functions.invoke("ObtenerPersonalArea", {});
        setUsuarios((res.data?.users || []).filter((u) => esParticipante(u.role)));
        const evals = await base44.entities.Evaluaciones_Alumno.list("-created_date", 200);
        setEvaluaciones(evals);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const evaluacionesDe = (uid) => evaluaciones.filter((e) => e.usuario === uid);

  const handleGuardar = async () => {
    const usuario = usuarios.find((u) => u.id === sel);
    if (!usuario) {
      toast({ title: "Selecciona un participante", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const nombreEval = nombreUsuario(perfil);
      await base44.entities.Evaluaciones_Alumno.create({
        usuario: usuario.id,
        usuario_nombre: nombreUsuario(usuario),
        evaluado_por: perfil.id,
        evaluado_por_nombre: nombreEval,
        area: perfil.area_encargada || "",
        periodo: form.periodo || "",
        puntualidad: Number(form.puntualidad),
        actitud: Number(form.actitud),
        calidad_trabajo: Number(form.calidad_trabajo),
        cumplimiento: Number(form.cumplimiento),
        iniciativa: Number(form.iniciativa),
        comentario: form.comentario,
        fecha: new Date().toISOString().split("T")[0],
      });
      await registrarBitacora("Evaluar alumno", "Evaluaciones", "Evaluación a " + nombreUsuario(usuario));
      toast({ title: "Evaluación guardada" });
      const evals = await base44.entities.Evaluaciones_Alumno.list("-created_date", 200);
      setEvaluaciones(evals);
      setForm({ puntualidad: 3, actitud: 3, calidad_trabajo: 3, cumplimiento: 3, iniciativa: 3, comentario: "", periodo: "" });
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const promedio = (e) => (Number(e.puntualidad) + Number(e.actitud) + Number(e.calidad_trabajo) + Number(e.cumplimiento) + Number(e.iniciativa)) / 5;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <ClipboardCheck className="h-7 w-7 text-primary" /> Evaluación de Alumnos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Califica el desempeño de los participantes de tu área.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <SectionCard title="Nueva evaluación">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Participante</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={sel} onChange={(e) => setSel(e.target.value)}>
                <option value="">Selecciona...</option>
                {usuarios.map((u) => <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Período (opcional)</Label>
              <input className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} placeholder="Ej. Ago-Dic 2026" />
            </div>
            {DIMENSIONES.map((d) => (
              <div key={d.key} className="space-y-1.5">
                <Label>{d.label}</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" onClick={() => setForm({ ...form, [d.key]: n })}
                      className={"h-11 w-11 sm:h-10 sm:w-10 rounded-lg border flex items-center justify-center text-sm font-medium transition-colors " +
                        (form[d.key] === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>Comentario</Label>
              <Textarea value={form.comentario} onChange={(e) => setForm({ ...form, comentario: e.target.value })} rows={3} placeholder="Comentarios cualitativos (opcional)" />
            </div>
            <Button onClick={handleGuardar} disabled={guardando || !sel} className="bg-primary text-primary-foreground">
              {guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar evaluación
            </Button>
          </div>
        </SectionCard>

        {/* Historial */}
        <SectionCard title="Evaluaciones recientes" icon={History}>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
          ) : evaluaciones.length === 0 ? (
            <EmptyState title="Sin evaluaciones" message="Aún no has evaluado a ningún participante." icon={Star} />
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto scrollbar-thin pr-1">
              {evaluaciones.map((e) => (
                <div key={e.id} className="rounded-lg border border-border p-3 bg-secondary/40">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{e.usuario_nombre}</p>
                    <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{promedio(e).toFixed(1)} / 5</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{formatearFecha(e.fecha)} · {e.periodo || "Sin período"}</p>
                  {e.comentario && <p className="text-xs text-muted-foreground italic mt-1">"{e.comentario}"</p>}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}