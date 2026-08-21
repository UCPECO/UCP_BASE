import React, { useState, useEffect } from "react";
import { ListaSkeleton } from "@/components/ucp/Skeleton";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ClipboardCheck, Save, CheckCircle2, History, Warehouse } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, fechaHoy, nombreUsuario } from "@/lib/ucpUtils";

export const ITEMS_CHECKLIST = [
  "Herramientas en su lugar",
  "Mesas despejadas",
  "Cables clasificados",
  "Equipos en su zona",
  "Pasillos libres",
  "Cajas identificadas",
  "Material pendiente registrado",
  "Residuos separados",
  "Área de trabajo limpia",
];

export default function ChecklistBodega() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [perfil, setPerfil] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marcados, setMarcados] = useState({});
  const [notas, setNotas] = useState("");
  const [registroHoy, setRegistroHoy] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const hoy = fechaHoy();
  const esStaff = perfil?.role === "admin" || perfil?.role === "encargado";
  const esDeBodega = esStaff || perfil?.area_asignada === "Bodega" || perfil?.area_encargada === "Bodega";

  const cargar = async () => {
    try {
      const me = await base44.auth.me();
      setPerfil(me);
      const lista = await base44.entities.Checklist_Bodega.list("-fecha", 200);
      setRegistros(lista || []);
      const mio = (lista || []).find((r) => r.usuario === me.id && r.fecha === hoy);
      if (mio) {
        setRegistroHoy(mio);
        try { setMarcados(JSON.parse(mio.items || "{}")); } catch { setMarcados({}); }
        setNotas(mio.notas || "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const toggle = (item) => setMarcados((m) => ({ ...m, [item]: !m[item] }));
  const totalMarcados = ITEMS_CHECKLIST.filter((i) => marcados[i]).length;
  const completo = totalMarcados === ITEMS_CHECKLIST.length;

  const guardar = async () => {
    setGuardando(true);
    try {
      const payload = {
        fecha: hoy,
        items: JSON.stringify(marcados),
        marcados: totalMarcados,
        total_items: ITEMS_CHECKLIST.length,
        completo: completo ? 1 : 0,
        notas: notas.trim(),
      };
      if (registroHoy) {
        await base44.entities.Checklist_Bodega.update(registroHoy.id, payload);
      } else {
        await base44.entities.Checklist_Bodega.create({
          ...payload,
          usuario: perfil.id,
          usuario_nombre: nombreUsuario(perfil),
        });
      }
      toast({
        title: completo ? "✓ Checklist completado" : "Checklist guardado",
        description: `${totalMarcados} de ${ITEMS_CHECKLIST.length} puntos verificados`,
      });
      cargar();
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  if (loading) return <div className="py-6"><ListaSkeleton filas={4} /></div>;

  if (!esDeBodega) {
    return (
      <div className="max-w-xl mx-auto">
        <SectionCard title="Checklist de Bodega" icon={Warehouse}>
          <EmptyState
            title="Exclusivo del área Bodega"
            message="Este checklist diario es solo para el personal asignado al área de Bodega."
            icon={Warehouse}
          />
        </SectionCard>
      </div>
    );
  }

  const historial = esStaff ? registros : registros.filter((r) => r.usuario === perfil?.id);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Checklist diario · Bodega</h1>
        <p className="text-sm text-muted-foreground mt-1">Verifica cada punto al terminar la jornada</p>
      </div>

      <SectionCard
        title={`Cierre de jornada · ${formatearFecha(hoy)}`}
        subtitle={registroHoy ? "Ya registraste el checklist de hoy: puedes actualizarlo" : "Marca los puntos verificados antes de irte"}
        icon={ClipboardCheck}
      >
        {/* Progreso */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-medium">{totalMarcados} de {ITEMS_CHECKLIST.length} puntos</span>
            {completo && <span className="flex items-center gap-1 text-emerald-600 font-semibold"><CheckCircle2 className="h-4 w-4" /> Completo</span>}
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${completo ? "bg-emerald-500" : "bg-primary"}`}
              style={{ width: `${(totalMarcados / ITEMS_CHECKLIST.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-2">
          {ITEMS_CHECKLIST.map((item) => (
            <button
              key={item}
              onClick={() => toggle(item)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                marcados[item]
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-border bg-card hover:bg-muted/50"
              }`}
            >
              <span className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                marcados[item] ? "bg-emerald-500 border-emerald-500" : "border-muted-foreground/40"
              }`}>
                {marcados[item] && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
              </span>
              <span className={`text-sm font-medium ${marcados[item] ? "" : "text-foreground"}`}>{item}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-1.5">
          <Label className="text-xs">Notas (opcional)</Label>
          <Textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ej. Faltaron cajas para clasificar cables, se pidió apoyo al encargado..."
          />
        </div>

        <Button onClick={guardar} disabled={guardando} className="w-full mt-4">
          <Save className="h-4 w-4 mr-2" /> {guardando ? "Guardando..." : registroHoy ? "Actualizar checklist de hoy" : "Guardar checklist de hoy"}
        </Button>
      </SectionCard>

      {/* Historial */}
      <SectionCard title={esStaff ? "Historial del área" : "Mi historial"} subtitle={`${historial.length} registro(s)`} icon={History}>
        {historial.length === 0 ? (
          <EmptyState title="Sin registros" message="Aún no hay checklists guardados." icon={ClipboardCheck} />
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
            {historial.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${r.completo ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"}`}>
                  {r.completo ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{formatearFecha(r.fecha)} · {r.marcados}/{r.total_items} puntos</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {esStaff ? `${r.usuario_nombre || "—"} · ` : ""}{r.notas || (r.completo ? "Jornada cerrada completa" : "Cierre parcial")}
                  </p>
                </div>
                {r.fecha === hoy && r.usuario === perfil?.id && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">HOY</span>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
