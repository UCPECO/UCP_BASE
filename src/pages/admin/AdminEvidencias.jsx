import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Image, Check, X, File, Link as LinkIcon, RotateCcw, Gift } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";

const TIPO_ICON = { foto: Image, link: LinkIcon };

export default function AdminEvidencias() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [evidencias, setEvidencias] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [actionId, setActionId] = useState(null);
  const [actionMode, setActionMode] = useState(null);
  const [comentario, setComentario] = useState("");
  const [bonoHoras, setBonoHoras] = useState("");
  const [bonoMotivo, setBonoMotivo] = useState("");

  const load = async () => {
    try {
      const [evs, us] = await Promise.all([
        base44.entities.Evidencias.list("-created_date", 500),
        base44.entities.User.list("full_name", 500),
      ]);
      setEvidencias(evs);
      setUsers(us);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const aprobar = async (ev) => {
    await base44.entities.Evidencias.update(ev.id, { estado_evidencia: "aprobada", aprobado_por: user.id });
    toast({ title: "Evidencia aprobada" });
    load();
  };

  const rechazar = async (ev) => {
    if (!comentario) { toast({ title: "Agrega un motivo", variant: "destructive" }); return; }
    await base44.entities.Evidencias.update(ev.id, { estado_evidencia: "rechazada", aprobado_por: user.id, comentario_revision: comentario });
    toast({ title: "Evidencia rechazada" });
    resetAction();
    load();
  };

  const regresar = async (ev) => {
    if (!comentario) { toast({ title: "Agrega el motivo de corrección", variant: "destructive" }); return; }
    await base44.entities.Evidencias.update(ev.id, { estado_evidencia: "regresada", aprobado_por: user.id, comentario_revision: comentario });
    toast({ title: "Evidencia regresada para corrección" });
    resetAction();
    load();
  };

  const asignarBono = async (ev) => {
    const horas = Number(bonoHoras);
    if (!horas || horas <= 0) { toast({ title: "Indica las horas del bono", variant: "destructive" }); return; }
    try {
      await base44.functions.invoke("AsignarBonoEvidencia", {
        evidencia_id: ev.id,
        bono_horas: horas,
        bono_motivo: bonoMotivo || "Bono de cumplimiento",
      });
      toast({ title: `Evidencia aprobada con ${horas} h de bono` });
      resetAction();
      load();
    } catch (e) {
      toast({ title: "Error al asignar bono", variant: "destructive" });
    }
  };

  const resetAction = () => {
    setActionId(null); setActionMode(null);
    setComentario(""); setBonoHoras(""); setBonoMotivo("");
  };

  const openAction = (ev, mode) => {
    setActionId(ev.id); setActionMode(mode);
    setComentario(""); setBonoHoras(""); setBonoMotivo("");
  };

  const filtered = filtro === "todos" ? evidencias : evidencias.filter(e => e.estado_evidencia === filtro);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Evidencias</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} evidencia(s)</p>
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="pendiente">Pendientes</option>
          <option value="regresada">Regresadas</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="todos">Todas</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <SectionCard><EmptyState title="Sin evidencias" message="No hay evidencias en este filtro." icon={Image} /></SectionCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ev) => {
            const u = users.find(x => x.id === ev.usuario);
            const Icon = TIPO_ICON[ev.tipo_evidencia] || File;
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
                    <Icon className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm">{nombreUsuario(u)}</p>
                    <StatusBadge status={ev.estado_evidencia} />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{ev.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-2 capitalize flex items-center gap-1"><Icon className="h-3 w-3" /> {ev.tipo_evidencia} · {formatearFecha(ev.fecha_captura || ev.created_date)}</p>
                  {ev.bono_horas > 0 && (
                    <p className="text-xs mt-2 bg-emerald-50 text-emerald-700 p-2 rounded-lg font-medium flex items-center gap-1"><Gift className="h-3 w-3" /> +{ev.bono_horas} h bono de cumplimiento</p>
                  )}
                  {ev.comentario_revision && (
                    <p className={`text-xs mt-2 p-2 rounded ${ev.estado_evidencia === "regresada" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-600"}`}>
                      {ev.comentario_revision}
                    </p>
                  )}

                  {ev.estado_evidencia === "pendiente" && (
                    actionId === ev.id ? (
                      <div className="mt-3 space-y-2">
                        {actionMode === "rechazar" && (
                          <>
                            <Textarea placeholder="Motivo del rechazo" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
                            <div className="flex gap-2">
                              <Button size="sm" variant="destructive" onClick={() => rechazar(ev)}>Confirmar rechazo</Button>
                              <Button size="sm" variant="outline" onClick={resetAction}>Cancelar</Button>
                            </div>
                          </>
                        )}
                        {actionMode === "regresar" && (
                          <>
                            <Textarea placeholder="Indica qué debe corregir el alumno" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => regresar(ev)}>Regresar</Button>
                              <Button size="sm" variant="outline" onClick={resetAction}>Cancelar</Button>
                            </div>
                          </>
                        )}
                        {actionMode === "bono" && (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <Input type="number" min="0.5" step="0.5" placeholder="Horas" value={bonoHoras} onChange={(e) => setBonoHoras(e.target.value)} />
                              <Input placeholder="Motivo (opcional)" value={bonoMotivo} onChange={(e) => setBonoMotivo(e.target.value)} />
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => asignarBono(ev)}>Aprobar con bono</Button>
                              <Button size="sm" variant="outline" onClick={resetAction}>Cancelar</Button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => aprobar(ev)}><Check className="h-4 w-4 mr-1" /> Aprobar</Button>
                        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => openAction(ev, "bono")}><Gift className="h-4 w-4 mr-1" /> Bono</Button>
                        <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openAction(ev, "regresar")}><RotateCcw className="h-4 w-4 mr-1" /> Regresar</Button>
                        <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => openAction(ev, "rechazar")}><X className="h-4 w-4 mr-1" /> Rechazar</Button>
                      </div>
                    )
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