import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Plus, Loader2, Trash2, Eye, X, BarChart3 } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { registrarBitacora } from "@/lib/bitacora";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const TIPOS_PREGUNTA = [
  { value: "escala_1_5", label: "Escala 1-5" },
  { value: "opcion_multiple", label: "Opción múltiple" },
  { value: "texto", label: "Texto abierto" },
];

export default function AdminEncuestas() {
  const { toast } = useToast();
  const [encuestas, setEncuestas] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viendo, setViendo] = useState(null);
  const [form, setForm] = useState({
    titulo: "",
    descripcion: "",
    preguntas: [{ texto: "", tipo: "escala_1_5", opciones: [] }],
  });
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const lista = await base44.entities.Encuestas.list("-created_date", 100);
      setEncuestas(lista);
      const res = await base44.entities.Respuestas_Encuesta.list("-created_date", 1000);
      setRespuestas(res);
    } catch (e) {
      toast({ title: "Error al cargar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const actualizarPregunta = (idx, campo, valor) => {
    setForm((f) => ({ ...f, preguntas: f.preguntas.map((p, i) => (i === idx ? { ...p, [campo]: valor } : p)) }));
  };
  const agregarPregunta = () => setForm((f) => ({ ...f, preguntas: [...f.preguntas, { texto: "", tipo: "escala_1_5", opciones: [] }] }));
  const quitarPregunta = (idx) => setForm((f) => ({ ...f, preguntas: f.preguntas.filter((_, i) => i !== idx) }));

  const handleCrear = async () => {
    if (!form.titulo || form.preguntas.length === 0) {
      toast({ title: "Agrega título y al menos una pregunta", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const perfil = await base44.auth.me();
      await base44.entities.Encuestas.create({
        titulo: form.titulo,
        descripcion: form.descripcion,
        preguntas: form.preguntas.filter((p) => p.texto),
        activa: true,
        periodo: "",
        creada_por: perfil.id,
      });
      await registrarBitacora("Crear encuesta", "Evaluaciones", form.titulo);
      toast({ title: "Encuesta creada" });
      setDialogOpen(false);
      setForm({ titulo: "", descripcion: "", preguntas: [{ texto: "", tipo: "escala_1_5", opciones: [] }] });
      cargar();
    } catch (e) {
      toast({ title: "Error al crear", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const toggleActiva = async (enc) => {
    try {
      await base44.entities.Encuestas.update(enc.id, { activa: !enc.activa });
      cargar();
    } catch (e) {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const eliminar = async (enc) => {
    try {
      await base44.entities.Encuestas.delete(enc.id);
      await registrarBitacora("Eliminar encuesta", "Evaluaciones", enc.titulo);
      cargar();
    } catch (e) {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const respuestasDe = (encId) => respuestas.filter((r) => r.encuesta === encId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" /> Encuestas de Satisfacción
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Crea encuestas y revisa los resultados.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Nueva encuesta
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
      ) : encuestas.length === 0 ? (
        <SectionCard title="Encuestas">
          <EmptyState title="Sin encuestas" message="Crea la primera encuesta con el botón de arriba." icon={ClipboardList} />
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {encuestas.map((enc) => {
            const res = respuestasDe(enc.id);
            return (
              <div key={enc.id} className="bg-card rounded-2xl border border-border shadow-sm p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{enc.titulo}</p>
                    {enc.descripcion && <p className="text-sm text-muted-foreground mt-0.5">{enc.descripcion}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{enc.preguntas?.length || 0} preguntas · {res.length} respuestas · {formatearFecha(enc.created_date)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={enc.activa ? "aprobada" : "rechazada"} />
                    <button onClick={() => setViendo(enc)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg" title="Ver resultados"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => toggleActiva(enc)} className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted">{enc.activa ? "Pausar" : "Activar"}</button>
                    <button onClick={() => eliminar(enc)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog crear */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva encuesta</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ej. Satisfacción del programa" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} />
            </div>
            <div className="space-y-3">
              <Label>Preguntas</Label>
              {form.preguntas.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input className="flex-1" value={p.texto} onChange={(e) => actualizarPregunta(idx, "texto", e.target.value)} placeholder={"Pregunta " + (idx + 1)} />
                    <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={p.tipo} onChange={(e) => actualizarPregunta(idx, "tipo", e.target.value)}>
                      {TIPOS_PREGUNTA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {form.preguntas.length > 1 && <button onClick={() => quitarPregunta(idx)} className="p-2 text-muted-foreground hover:text-destructive"><X className="h-4 w-4" /></button>}
                  </div>
                  {p.tipo === "opcion_multiple" && (
                    <Input value={(p.opciones || []).join(", ")} onChange={(e) => actualizarPregunta(idx, "opciones", e.target.value.split(",").map((s) => s.trim()))} placeholder="Opciones separadas por coma" />
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={agregarPregunta}><Plus className="h-4 w-4 mr-1.5" /> Agregar pregunta</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={handleCrear} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Crear encuesta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog resultados */}
      <Dialog open={!!viendo} onOpenChange={() => setViendo(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viendo?.titulo}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {respuestasDe(viendo?.id || "").length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin respuestas aún.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><BarChart3 className="h-4 w-4" /> {respuestasDe(viendo?.id).length} respuestas</div>
                {(viendo?.preguntas || []).map((p, pi) => {
                  const rs = respuestasDe(viendo.id).map((r) => r.respuestas?.find((x) => x.pregunta === pi)?.valor).filter((v) => v != null);
                  const promedio = p.tipo === "escala_1_5" && rs.length > 0 ? (rs.reduce((a, v) => a + Number(v), 0) / rs.length).toFixed(2) : null;
                  return (
                    <div key={pi} className="rounded-lg border border-border p-3">
                      <p className="font-medium text-sm mb-2">{pi + 1}. {p.texto}</p>
                      {promedio ? (
                        <p className="text-sm text-primary font-semibold">Promedio: {promedio} / 5</p>
                      ) : (
                        <div className="space-y-1">
                          {rs.slice(0, 5).map((r, ri) => <p key={ri} className="text-xs text-muted-foreground">· {String(r)}</p>)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}