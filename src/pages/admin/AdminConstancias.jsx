import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Award, Plus, Search, Ban, Download, Loader2, FileText } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { generarConstanciaPDF } from "@/lib/generarConstancia";
import { registrarBitacora } from "@/lib/bitacora";
import { labelArea } from "@/lib/areas";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const TIPOS = [
  { value: "constancia_termino", label: "Constancia de Término" },
  { value: "reconocimiento", label: "Reconocimiento" },
  { value: "recomendacion", label: "Carta de Recomendación" },
];

export default function AdminConstancias() {
  const { toast } = useToast();
  const [perfil, setPerfil] = useState(null);
  const [constancias, setConstancias] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [generando, setGenerando] = useState(false);
  const [form, setForm] = useState({
    usuario: "",
    tipo: "constancia_termino",
    horas_completadas: 0,
    fecha_inicio: "",
    fecha_fin: "",
  });

  const esAdmin = perfil?.role === "admin";

  useEffect(() => {
    base44.auth.me().then(setPerfil).catch(() => {});
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const lista = await base44.entities.Constancias.list("-created_date", 200);
      const visibles = esAdmin ? lista : lista.filter((c) => c.area === perfil?.area_encargada);
      setConstancias(visibles);

      if (esAdmin) {
        const users = await base44.entities.User.list("full_name", 500);
        setUsuarios(users.filter((u) => !u.archivado && (u.role === "servicio_social" || u.role === "voluntario")));
      } else {
        const res = await base44.functions.invoke("ObtenerPersonalArea", {});
        setUsuarios((res.data?.users || []).filter((u) => u.role === "servicio_social" || u.role === "voluntario"));
      }
    } catch (e) {
      toast({ title: "Error al cargar", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (perfil) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  const generarFolio = () => "UCP-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();

  const handleGenerar = async () => {
    const usuario = usuarios.find((u) => u.id === form.usuario);
    if (!usuario) {
      toast({ title: "Selecciona un participante", variant: "destructive" });
      return;
    }
    setGenerando(true);
    try {
      const folio = generarFolio();
      const nombreGenerador = nombreUsuario(perfil);
      const area = usuario.area_asignada || perfil?.area_encargada || "";
      const registro = {
        usuario: usuario.id,
        usuario_nombre: nombreUsuario(usuario),
        matricula: usuario.matricula || "",
        tipo: form.tipo,
        area,
        horas_completadas: Number(form.horas_completadas) || 0,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
        folio,
        estado: "vigente",
        generado_por: perfil.id,
        generado_por_nombre: nombreGenerador,
      };
      const creada = await base44.entities.Constancias.create(registro);
      generarConstanciaPDF(creada);
      await registrarBitacora("Generar constancia", "Certificados", "Folio " + folio + " para " + registro.usuario_nombre);
      toast({ title: "Constancia generada y descargada" });
      setDialogOpen(false);
      setForm({ usuario: "", tipo: "constancia_termino", horas_completadas: 0, fecha_inicio: "", fecha_fin: "" });
      cargar();
    } catch (e) {
      toast({ title: "Error al generar", variant: "destructive" });
    } finally {
      setGenerando(false);
    }
  };

  const revocar = async (c) => {
    try {
      await base44.entities.Constancias.update(c.id, { estado: "revocada" });
      await registrarBitacora("Revocar constancia", "Certificados", "Folio " + c.folio);
      toast({ title: "Constancia revocada" });
      cargar();
    } catch (e) {
      toast({ title: "Error al revocar", variant: "destructive" });
    }
  };

  const descargar = (c) => generarConstanciaPDF(c);

  const filtradas = constancias.filter((c) => {
    const txt = (c.usuario_nombre + " " + (c.matricula || "") + " " + c.folio + " " + (c.area || "")).toLowerCase();
    return txt.includes(busqueda.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
            <Award className="h-7 w-7 text-primary" /> Constancias y Documentación
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Genera, descarga y revoca documentos oficiales.</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground">
          <Plus className="h-4 w-4 mr-2" /> Generar constancia
        </Button>
      </div>

      <SectionCard
        title="Constancias emitidas"
        subtitle={filtradas.length + " registros"}
        action={
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input className="pl-8 w-48" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
        ) : filtradas.length === 0 ? (
          <EmptyState title="Sin constancias" message="Genera la primera constancia con el botón de arriba." icon={Award} />
        ) : (
          <div className="space-y-2 max-h-[520px] overflow-y-auto scrollbar-thin pr-1">
            {filtradas.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><FileText className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{c.usuario_nombre} {c.matricula && <span className="text-muted-foreground">· {c.matricula}</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    {TIPOS.find((t) => t.value === c.tipo)?.label} · {labelArea(c.area)} · Folio {c.folio} · {formatearFecha(c.created_date)}
                  </p>
                  {c.horas_completadas > 0 && <p className="text-xs text-muted-foreground">{c.horas_completadas} hrs</p>}
                </div>
                <StatusBadge status={c.estado} />
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => descargar(c)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg" title="Descargar PDF"><Download className="h-4 w-4" /></button>
                  {esAdmin && c.estado === "vigente" && (
                    <button onClick={() => revocar(c)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg" title="Revocar"><Ban className="h-4 w-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generar constancia</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Participante</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })}>
                <option value="">Selecciona...</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>{nombreUsuario(u)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de documento</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Horas completadas</Label>
                <Input type="number" value={form.horas_completadas} onChange={(e) => setForm({ ...form, horas_completadas: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha inicio</Label>
                <Input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha fin</Label>
                <Input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={generando}>Cancelar</Button>
            <Button onClick={handleGenerar} disabled={generando}>
              {generando ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...</> : <><Download className="h-4 w-4 mr-2" /> Generar y descargar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}