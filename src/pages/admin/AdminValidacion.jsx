import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { CheckCheck, ChevronDown, ChevronRight, Pencil, Plus, Minus, Clock, Loader2, Check } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import KpiCard from "@/components/ucp/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { labelArea } from "@/lib/areas";
import { minutosRegistro, minutosOficiales, periodoDe, fmtMinutos } from "@/lib/redondeo";
import { registrarBitacora } from "@/lib/bitacora";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function AdminValidacion() {
  const { user } = useAuth();
  const { toast } = useToast();
  const hoy = new Date().toISOString().slice(0, 7);
  const [periodo, setPeriodo] = useState(hoy);
  const [registros, setRegistros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState(null);
  const [editando, setEditando] = useState(null); // { id, hora_entrada, hora_salida, comentario_admin }
  const [dialogAjuste, setDialogAjuste] = useState(null); // { usuario, nombre }
  const [formAjuste, setFormAjuste] = useState({ minutos: 0, motivo: "" });
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [regs, us, ajs] = await Promise.all([
        base44.entities.Registros_QR.list("-fecha", 1000),
        base44.entities.User.list("full_name", 500),
        base44.entities.Ajustes_Horas.list("-created_date", 500),
      ]);
      setRegistros(regs);
      setUsuarios(us.filter((u) => !u.archivado));
      setAjustes(ajs);
    } catch (e) {
      toast({ title: "Error al cargar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const nombreDe = (id) => {
    const u = usuarios.find((x) => x.id === id);
    return u?.nombre_completo || u?.full_name || u?.email || "—";
  };

  // Resumen por usuario para el periodo seleccionado
  const porUsuario = useMemo(() => {
    const cerrados = registros.filter((r) =>
      (r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && periodoDe(r.fecha) === periodo
    );
    const mapa = {};
    cerrados.forEach((r) => {
      if (!mapa[r.usuario]) mapa[r.usuario] = { registros: [], validados: [], pendientes: [] };
      mapa[r.usuario].registros.push(r);
      (r.validado ? mapa[r.usuario].validados : mapa[r.usuario].pendientes).push(r);
    });
    return Object.entries(mapa).map(([uid, g]) => {
      // El redondeo y el residuo se calculan sobre los fichajes ya validados
      const minReales = g.validados.reduce((a, r) => a + minutosRegistro(r), 0);
      const minOficiales = g.validados.reduce((a, r) => a + minutosOficiales(r), 0);
      const residuo = minReales - minOficiales;
      const acreditado = ajustes
        .filter((a) => a.usuario === uid && a.tipo === "residuo" && a.periodo === periodo)
        .reduce((a, x) => a + (x.minutos || 0), 0);
      const ajustesManuales = ajustes
        .filter((a) => a.usuario === uid && a.tipo !== "residuo" && a.periodo === periodo)
        .reduce((a, x) => a + (x.minutos || 0), 0);
      return {
        usuario: uid,
        ...g,
        minReales, minOficiales, residuo,
        acreditado,
        pendiente: residuo - acreditado,
        ajustesManuales,
        horasOficiales: Math.round(((minOficiales + acreditado + ajustesManuales) / 60) * 100) / 100,
      };
    }).sort((a, b) => nombreDe(a.usuario).localeCompare(nombreDe(b.usuario)));
  }, [registros, ajustes, periodo, usuarios]);

  const totPendientes = porUsuario.reduce((a, u) => a + u.pendientes.length, 0);
  const totResiduo = porUsuario.reduce((a, u) => a + Math.max(0, u.pendiente), 0);

  const validar = async (r, valor) => {
    try {
      await base44.entities.Registros_QR.update(r.id, valor
        ? { validado: 1, validado_por: user.id }
        : { validado: 0, validado_por: "" });
      toast({ title: valor ? "Fichaje validado" : "Validación retirada" });
      cargar();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const validarTodos = async (u) => {
    setGuardando(true);
    try {
      for (const r of u.pendientes) {
        await base44.entities.Registros_QR.update(r.id, { validado: 1, validado_por: user.id });
      }
      toast({ title: `${u.pendientes.length} fichaje(s) validados`, description: nombreDe(u.usuario) });
      cargar();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setGuardando(false); }
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      await base44.entities.Registros_QR.update(editando.id, {
        hora_entrada: editando.hora_entrada,
        hora_salida: editando.hora_salida,
        comentario_admin: editando.comentario_admin || "",
        modificado_por: user.id,
      });
      await registrarBitacora("Ajustar fichaje", "Validación", `${nombreDe(editando.usuario)} · ${editando.fecha} → ${editando.hora_entrada}-${editando.hora_salida}`);
      toast({ title: "Fichaje ajustado" });
      setEditando(null);
      cargar();
    } catch (e) { toast({ title: "Error al ajustar", description: e.message, variant: "destructive" }); }
    finally { setGuardando(false); }
  };

  const acreditarResiduo = async (u) => {
    if (!u.pendiente) return;
    setGuardando(true);
    try {
      await base44.entities.Ajustes_Horas.create({
        usuario: u.usuario,
        minutos: u.pendiente,
        tipo: "residuo",
        periodo,
        motivo: `Minutos acumulados por redondeo de fichajes (${MESES[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)})`,
        creado_por: user.id,
        creado_por_nombre: nombreUsuario(user),
      });
      await registrarBitacora("Acreditar residuo de minutos", "Validación", `${nombreDe(u.usuario)} · ${u.pendiente} min · ${periodo}`);
      toast({ title: "Residuo acreditado", description: `${nombreDe(u.usuario)}: ${fmtMinutos(u.pendiente)}` });
      cargar();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setGuardando(false); }
  };

  const guardarAjusteManual = async () => {
    const mins = Number(formAjuste.minutos);
    if (!dialogAjuste || !mins || !formAjuste.motivo.trim()) {
      toast({ title: "Indica los minutos y el motivo", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      await base44.entities.Ajustes_Horas.create({
        usuario: dialogAjuste.usuario,
        minutos: mins,
        tipo: "manual",
        periodo,
        motivo: formAjuste.motivo.trim(),
        creado_por: user.id,
        creado_por_nombre: nombreUsuario(user),
      });
      await registrarBitacora("Ajuste manual de horas", "Validación", `${dialogAjuste.nombre} · ${mins} min · ${formAjuste.motivo}`);
      toast({ title: "Ajuste aplicado", description: `${dialogAjuste.nombre}: ${fmtMinutos(mins)}` });
      setDialogAjuste(null);
      setFormAjuste({ minutos: 0, motivo: "" });
      cargar();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setGuardando(false); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
            <CheckCheck className="h-7 w-7 text-primary" /> Validación de horas y ajustes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Los fichajes se redondean al bloque de 10 min más cercano. Los minutos truncados se acumulan por mes y aquí los acreditas.
          </p>
        </div>
        <Input type="month" className="w-44" value={periodo} onChange={(e) => setPeriodo(e.target.value || hoy)} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Clock} label="Personas con fichajes" value={porUsuario.length} tone="primary" />
        <KpiCard icon={CheckCheck} label="Fichajes por validar" value={totPendientes} tone="accent" />
        <KpiCard icon={Plus} label="Minutos por acreditar" value={fmtMinutos(totResiduo)} tone="blue" />
        <KpiCard icon={Check} label="Validados este mes" value={porUsuario.reduce((a, u) => a + u.validados.length, 0)} tone="accent" />
      </div>

      {porUsuario.length === 0 ? (
        <SectionCard><EmptyState title="Sin fichajes en este mes" message="Cambia el periodo o espera a que se cierren fichajes." icon={Clock} /></SectionCard>
      ) : (
        <div className="space-y-3">
          {porUsuario.map((u) => (
            <div key={u.usuario} className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
              {/* Fila resumen */}
              <button className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors" onClick={() => setExpandido(expandido === u.usuario ? null : u.usuario)}>
                {expandido === u.usuario ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0">
                  {nombreDe(u.usuario).charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{nombreDe(u.usuario)}</p>
                  <p className="text-xs text-muted-foreground">
                    {u.registros.length} fichaje(s) · oficial: <b>{u.horasOficiales} h</b>
                    {u.pendientes.length > 0 && <span className="text-amber-600 font-medium"> · {u.pendientes.length} por validar</span>}
                  </p>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <p className="text-xs text-muted-foreground">Residuo del mes</p>
                  <p className={`text-sm font-semibold ${u.pendiente > 0 ? "text-amber-600" : u.pendiente < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                    {u.pendiente > 0 ? `${fmtMinutos(u.pendiente)} pendiente` : u.pendiente < 0 ? fmtMinutos(u.pendiente) : "al corriente"}
                  </p>
                </div>
              </button>

              {/* Detalle */}
              {expandido === u.usuario && (
                <div className="border-t border-border p-4 space-y-4 bg-muted/20">
                  {/* Acciones */}
                  <div className="flex flex-wrap gap-2">
                    {u.pendientes.length > 0 && (
                      <Button size="sm" onClick={() => validarTodos(u)} disabled={guardando}>
                        <CheckCheck className="h-4 w-4 mr-1.5" /> Validar todos ({u.pendientes.length})
                      </Button>
                    )}
                    {u.pendiente !== 0 && (
                      <Button size="sm" variant="outline" onClick={() => acreditarResiduo(u)} disabled={guardando}>
                        <Plus className="h-4 w-4 mr-1.5" /> Acreditar residuo ({fmtMinutos(u.pendiente)})
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setDialogAjuste({ usuario: u.usuario, nombre: nombreDe(u.usuario) }); setFormAjuste({ minutos: 0, motivo: "" }); }}>
                      <Pencil className="h-4 w-4 mr-1.5" /> Ajuste manual
                    </Button>
                  </div>

                  {/* Números del mes */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    {[
                      ["Min. reales (validados)", fmtMinutos(u.minReales)],
                      ["Min. oficiales (redondeo 10)", fmtMinutos(u.minOficiales)],
                      ["Residuo acreditado", fmtMinutos(u.acreditado)],
                      ["Ajustes manuales", fmtMinutos(u.ajustesManuales)],
                      ["Horas del mes", `${u.horasOficiales} h`],
                    ].map(([label, val]) => (
                      <div key={label} className="rounded-lg border border-border bg-card p-2.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                        <p className="text-sm font-bold mt-0.5">{val}</p>
                      </div>
                    ))}
                  </div>

                  {/* Fichajes */}
                  <div className="space-y-2">
                    {u.registros.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((r) => {
                      const minsR = minutosRegistro(r);
                      const minsO = minutosOficiales(r);
                      const enEdicion = editando?.id === r.id;
                      return (
                        <div key={r.id} className="rounded-lg border border-border bg-card p-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="text-sm">
                              <span className="font-medium">{formatearFecha(r.fecha)}</span>
                              <span className="text-muted-foreground"> · {r.hora_entrada} → {r.hora_salida || "—"}</span>
                              {r.area ? <span className="text-muted-foreground"> · {labelArea(r.area) || r.area}</span> : null}
                              {r.es_manual ? <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600">manual</span> : null}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs text-muted-foreground" title="Minutos reales → oficiales (redondeo a 10)">
                                {minsR} min → <b>{minsO} min</b>
                              </span>
                              <StatusBadge status={r.estado_registro} />
                              {r.validado ? (
                                <>
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">validado</span>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => validar(r, false)}>Quitar</Button>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700 border-emerald-300" onClick={() => validar(r, true)}>Validar</Button>
                              )}
                              {!enEdicion && (
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditando({ id: r.id, usuario: r.usuario, fecha: r.fecha, hora_entrada: r.hora_entrada, hora_salida: r.hora_salida || "", comentario_admin: r.comentario_admin || "" })}>
                                  <Pencil className="h-3.5 w-3.5 mr-1" /> Ajustar
                                </Button>
                              )}
                            </div>
                          </div>
                          {r.comentario_admin && !enEdicion && (
                            <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded">Comentario: {r.comentario_admin}</p>
                          )}
                          {enEdicion && (
                            <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                              <div>
                                <Label className="text-xs">Entrada</Label>
                                <Input type="time" className="h-9" value={editando.hora_entrada} onChange={(e) => setEditando({ ...editando, hora_entrada: e.target.value })} />
                              </div>
                              <div>
                                <Label className="text-xs">Salida</Label>
                                <Input type="time" className="h-9" value={editando.hora_salida} onChange={(e) => setEditando({ ...editando, hora_salida: e.target.value })} />
                              </div>
                              <div className="col-span-2">
                                <Label className="text-xs">Comentario (motivo del ajuste)</Label>
                                <Textarea rows={1} value={editando.comentario_admin} onChange={(e) => setEditando({ ...editando, comentario_admin: e.target.value })} placeholder="Ej. Olvidó fichar salida" />
                              </div>
                              <div className="col-span-2 sm:col-span-4 flex gap-2 justify-end">
                                <Button size="sm" variant="outline" onClick={() => setEditando(null)} disabled={guardando}>Cancelar</Button>
                                <Button size="sm" onClick={guardarEdicion} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar ajuste"}</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Historial de ajustes del periodo */}
      <SectionCard title="Ajustes aplicados en el periodo" subtitle="Residuos acreditados y ajustes manuales">
        {ajustes.filter((a) => a.periodo === periodo).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">Sin ajustes en este periodo.</p>
        ) : (
          <div className="space-y-2">
            {ajustes.filter((a) => a.periodo === periodo).map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${a.minutos >= 0 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}`}>
                  {a.minutos >= 0 ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{nombreDe(a.usuario)} · {fmtMinutos(a.minutos)}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.motivo} · {a.creado_por_nombre || "admin"} · {formatearFecha((a.created_date || "").slice(0, 10))}</p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize">{a.tipo}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Dialog ajuste manual */}
      <Dialog open={!!dialogAjuste} onOpenChange={(v) => !v && setDialogAjuste(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajuste manual de horas — {dialogAjuste?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Minutos (positivo suma, negativo resta)</Label>
              <Input type="number" step="5" value={formAjuste.minutos} onChange={(e) => setFormAjuste({ ...formAjuste, minutos: e.target.value })} placeholder="Ej. 30 o -20" />
              <p className="text-xs text-muted-foreground">{Number(formAjuste.minutos) ? `= ${fmtMinutos(Number(formAjuste.minutos))}` : "Se aplica al total del periodo seleccionado."}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo *</Label>
              <Textarea value={formAjuste.motivo} onChange={(e) => setFormAjuste({ ...formAjuste, motivo: e.target.value })} placeholder="Ej. Compensación por evento especial" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAjuste(null)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardarAjusteManual} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Aplicar ajuste</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
