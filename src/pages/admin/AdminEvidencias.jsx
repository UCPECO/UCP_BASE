import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import useRecargarAlVolver from "@/hooks/useRecargarAlVolver";
import { useAuth } from "@/lib/AuthContext";
import { Image, Check, X, File, Link as LinkIcon, RotateCcw, Gift } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import ComentariosEvidencia from "@/components/ucp/ComentariosEvidencia";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";

const TIPO_ICON = { foto: Image, link: LinkIcon };

export default function AdminEvidencias() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [evidencias, setEvidencias] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("pendiente");
  const [detalle, setDetalle] = useState(null);
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
      // Si el detalle está abierto, refrescarlo con los datos nuevos
      setDetalle((d) => (d ? evs.find((e) => e.id === d.id) || null : null));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useRecargarAlVolver(load);

  const aprobar = async (ev) => {
    await base44.entities.Evidencias.update(ev.id, { estado_evidencia: "aprobada", aprobado_por: user.id });
    toast({ title: "Evidencia aprobada" });
    resetAction();
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
    setActionMode(null);
    setComentario(""); setBonoHoras(""); setBonoMotivo("");
  };

  const openAction = (mode) => {
    setActionMode(mode);
    setComentario(""); setBonoHoras(""); setBonoMotivo("");
  };

  const filtered = filtro === "todos" ? evidencias : evidencias.filter(e => e.estado_evidencia === filtro);
  const autorDe = (ev) => users.find((x) => x.id === ev.usuario);

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Evidencias</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} evidencia(s) · toca una tarjeta para verla en grande y comentar</p>
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
            const Icon = TIPO_ICON[ev.tipo_evidencia] || File;
            return (
              <div key={ev.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setDetalle(ev); resetAction(); }}>
                <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                  {ev.tipo_evidencia === "foto" && ev.archivo_url ? (
                    <img src={ev.archivo_url} alt={ev.descripcion} className="h-full w-full object-cover" />
                  ) : ev.tipo_evidencia === "link" && ev.archivo_url ? (
                    <div className="flex flex-col items-center gap-2 text-primary">
                      <LinkIcon className="h-10 w-10" />
                      <span className="text-xs">Enlace adjunto</span>
                    </div>
                  ) : (
                    <Icon className="h-10 w-10 text-muted-foreground" />
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm">{nombreUsuario(autorDe(ev))}</p>
                    <StatusBadge status={ev.estado_evidencia} />
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{ev.descripcion}</p>
                  <p className="text-xs text-muted-foreground mt-2 capitalize flex items-center gap-1">
                    <Icon className="h-3 w-3" /> {ev.tipo_evidencia === "foto" ? "imagen" : "enlace"} · {formatearFecha(ev.fecha_captura || ev.created_date)}
                  </p>
                  {ev.bono_horas > 0 && (
                    <p className="text-xs mt-2 bg-emerald-50 text-emerald-700 p-2 rounded-lg font-medium flex items-center gap-1"><Gift className="h-3 w-3" /> +{ev.bono_horas} h bono de cumplimiento</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalle con acciones de revisión + comentarios */}
      <Dialog open={!!detalle} onOpenChange={(open) => { if (!open) { setDetalle(null); resetAction(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detalle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  {nombreUsuario(autorDe(detalle))} <StatusBadge status={detalle.estado_evidencia} />
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {detalle.tipo_evidencia === "foto" && detalle.archivo_url ? (
                  <a href={detalle.archivo_url} target="_blank" rel="noreferrer">
                    <img src={detalle.archivo_url} alt={detalle.descripcion} className="w-full max-h-[45vh] object-contain rounded-xl bg-muted" />
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

                {detalle.bono_horas > 0 && (
                  <p className="text-xs bg-emerald-50 text-emerald-700 p-2 rounded-lg font-medium flex items-center gap-1">
                    <Gift className="h-3 w-3" /> +{detalle.bono_horas} h bono{detalle.bono_motivo ? ` · ${detalle.bono_motivo}` : ""}
                  </p>
                )}
                {detalle.comentario_revision && (
                  <p className={`text-xs p-2 rounded-lg ${detalle.estado_evidencia === "regresada" ? "bg-blue-50 text-blue-700" : "bg-rose-50 text-rose-600"}`}>
                    {detalle.comentario_revision}
                  </p>
                )}

                {detalle.estado_evidencia === "pendiente" && (
                  actionMode ? (
                    <div className="space-y-2 border-t border-border pt-3">
                      {actionMode === "rechazar" && (
                        <>
                          <Textarea placeholder="Motivo del rechazo" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" onClick={() => rechazar(detalle)}>Confirmar rechazo</Button>
                            <Button size="sm" variant="outline" onClick={resetAction}>Cancelar</Button>
                          </div>
                        </>
                      )}
                      {actionMode === "regresar" && (
                        <>
                          <Textarea placeholder="Indica qué debe corregir el alumno" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} />
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => regresar(detalle)}>Regresar</Button>
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
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => asignarBono(detalle)}>Aprobar con bono</Button>
                            <Button size="sm" variant="outline" onClick={resetAction}>Cancelar</Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => aprobar(detalle)}><Check className="h-4 w-4 mr-1" /> Aprobar</Button>
                      <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => openAction("bono")}><Gift className="h-4 w-4 mr-1" /> Bono</Button>
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openAction("regresar")}><RotateCcw className="h-4 w-4 mr-1" /> Regresar</Button>
                      <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => openAction("rechazar")}><X className="h-4 w-4 mr-1" /> Rechazar</Button>
                    </div>
                  )
                )}

                <div className="border-t border-border pt-3">
                  <ComentariosEvidencia evidenciaId={detalle.id} />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
