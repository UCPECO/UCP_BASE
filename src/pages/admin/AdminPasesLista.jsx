import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { AREAS, labelArea } from "@/lib/areas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  UserCheck, BellRing, CheckCircle2, Clock, ChevronDown, ChevronUp, XCircle, Send, Loader2,
} from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { formatearFecha } from "@/lib/ucpUtils";

export default function AdminPasesLista() {
  const [perfil, setPerfil] = useState(null);
  const [pases, setPases] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [areaSel, setAreaSel] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const [notifMsg, setNotifMsg] = useState(null);

  const esAdmin = perfil?.role === "admin";
  const areaEncargado = perfil?.area_encargada;

  useEffect(() => {
    base44.auth.me().then(setPerfil).catch(() => {});
  }, []);

  useEffect(() => {
    if (perfil?.role === "encargado" && areaEncargado) {
      setAreaSel(areaEncargado);
    }
  }, [perfil, areaEncargado]);

  const cargarDatos = useCallback(async () => {
    if (!perfil) return;
    setLoading(true);
    try {
      const lista = await base44.entities.Pases_Lista.list("-created_date", 50);
      // Encargado solo ve pases de su área
      const visibles = esAdmin ? lista : lista.filter((p) => p.area === areaEncargado);
      setPases(visibles);

      const todasResp = await base44.entities.Respuestas_Pases_Lista.list("-created_date", 500);
      setRespuestas(todasResp);

      if (esAdmin) {
        const users = await base44.entities.User.list("full_name", 500);
        setUsuarios(users.filter((u) => !u.archivado));
      } else {
        const res = await base44.functions.invoke("ObtenerPersonalArea", {});
        setUsuarios(res.data?.users || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [perfil, esAdmin, areaEncargado]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Suscripción a nuevas respuestas en tiempo real
  useEffect(() => {
    const unsub = base44.entities.Respuestas_Pases_Lista.subscribe((event) => {
      if (event.type === "create") {
        setRespuestas((prev) => [event.data, ...prev]);
      }
    });
    return unsub;
  }, []);

  const iniciarPaseLista = async () => {
    if (!areaSel) return;
    setEnviando(true);
    try {
      const res = await base44.functions.invoke("IniciarPaseLista", { area: areaSel, mensaje });
      setNotifMsg(`Pase de lista iniciado. ${res.data?.notificados ?? 0} personas notificadas.`);
      setDialogOpen(false);
      setMensaje("");
      await cargarDatos();
      setTimeout(() => setNotifMsg(null), 5000);
    } catch (e) {
      setNotifMsg("Error al iniciar el pase de lista.");
    } finally {
      setEnviando(false);
    }
  };

  const cerrarPase = async (p) => {
    try {
      await base44.entities.Pases_Lista.update(p.id, { estado: "cerrado" });
      await cargarDatos();
    } catch (e) {
      console.error(e);
    }
  };

  const usuariosDelArea = (area) => usuarios.filter((u) => u.area_asignada === area);
  const respuestasDePase = (paseId) => respuestas.filter((r) => r.pase_lista === paseId);
  const presentesIds = (paseId) => new Set(respuestasDePase(paseId).map((r) => r.usuario));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
            <UserCheck className="h-7 w-7 text-primary" /> Pase de Lista
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Verifica la presencia de tu equipo por área y envíales una notificación a sus dispositivos.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground">
              <BellRing className="h-4 w-4 mr-2" /> Iniciar pase de lista
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Iniciar pase de lista</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Área</Label>
                {esAdmin ? (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    value={areaSel}
                    onChange={(e) => setAreaSel(e.target.value)}
                  >
                    <option value="">Selecciona un área...</option>
                    {AREAS.map((a) => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="h-9 w-full rounded-md border border-input bg-muted px-3 flex items-center text-sm font-medium">
                    {labelArea(areaEncargado)}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Mensaje (opcional)</Label>
                <Textarea
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                  placeholder="Ej. Por favor confirmen su presencia en bodega."
                  rows={3}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Se enviará una notificación push a todos los participantes activos del área seleccionada.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={iniciarPaseLista} disabled={enviando || !areaSel}>
                {enviando ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" /> Iniciar y notificar</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {notifMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-medium">
          {notifMsg}
        </div>
      )}

      {/* Lista de pases de lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-primary animate-spin" />
        </div>
      ) : pases.length === 0 ? (
        <SectionCard title="Historial" subtitle="Pases de lista realizados">
          <EmptyState
            title="Sin pases de lista"
            message="Inicia un pase de lista para verificar la presencia de tu equipo."
            icon={UserCheck}
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {pases.map((p) => {
            const areaUsers = usuariosDelArea(p.area);
            const presentes = presentesIds(p.id);
            const presentesCount = areaUsers.filter((u) => presentes.has(u.id)).length;
            const pendientesCount = areaUsers.length - presentesCount;
            const isExp = expandido === p.id;
            return (
              <div key={p.id} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandido(isExp ? null : p.id)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${p.estado === "activo" ? "bg-amber-100 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                      <BellRing className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{labelArea(p.area)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatearFecha(p.created_date)} · {p.creado_por_nombre || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden sm:flex items-center gap-2 text-sm">
                      <span className="flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="h-4 w-4" /> {presentesCount}
                      </span>
                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                        <Clock className="h-4 w-4" /> {pendientesCount}
                      </span>
                    </div>
                    <StatusBadge status={p.estado} />
                    {isExp ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExp && (
                  <div className="border-t border-border px-5 py-4 bg-muted/20">
                    {p.mensaje && (
                      <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
                        <span className="font-medium">Mensaje: </span>{p.mensaje}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-foreground">
                        Presentes: {presentesCount} / {areaUsers.length}
                      </p>
                      {p.estado === "activo" && (
                        <Button variant="outline" size="sm" onClick={() => cerrarPase(p)}>
                          <XCircle className="h-4 w-4 mr-1.5" /> Cerrar pase de lista
                        </Button>
                      )}
                    </div>
                    {areaUsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No hay participantes asignados a esta área.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {areaUsers.map((u) => {
                          const presente = presentes.has(u.id);
                          const resp = respuestasDePase(p.id).find((r) => r.usuario === u.id);
                          return (
                            <div
                              key={u.id}
                              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${presente ? "bg-emerald-50 border-emerald-200" : "bg-card border-border"}`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {u.nombre_completo || u.full_name || "—"}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {u.matricula || u.email || ""}
                                </p>
                              </div>
                              {presente ? (
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 shrink-0">
                                  <CheckCircle2 className="h-4 w-4" />
                                  {resp?.fecha_respuesta ? new Date(resp.fecha_respuesta).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs font-medium text-amber-600 shrink-0">
                                  <Clock className="h-4 w-4" /> Pendiente
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}