import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays, Clock, Award, AlertTriangle, Trash2, Save, UserX, RefreshCw,
  FolderKanban, CheckCircle2, FileDown, Image as ImageIcon, History, ExternalLink, ShieldCheck,
  IdCard, Pencil, X,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { confirmarGlobal } from "@/components/ucp/ConfirmDialog";
import { formatearFecha, calcularHoras, sumarHorasRegistros, sumarHorasPorValidar, sumarHorasBonos } from "@/lib/ucpUtils";
import { generarReportePdfMensual } from "@/lib/generarReporte";
import { AREAS, labelArea, labelEtiqueta } from "@/lib/areas";
import { esParticipante } from "@/lib/roles";

const ROL_LABEL = {
  admin: "Administrador",
  encargado: "Encargado",
  servicio_social: "Servicio Social",
  voluntario: "Voluntario",
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const ESTADO_BADGE = {
  activo: "bg-emerald-100 text-emerald-700",
  completado: "bg-blue-100 text-blue-700",
  cancelado: "bg-rose-100 text-rose-700",
  bajo_revision: "bg-orange-100 text-orange-700",
  abierto: "bg-amber-100 text-amber-700",
  cerrado: "bg-emerald-100 text-emerald-700",
  incompleto: "bg-orange-100 text-orange-700",
  pendiente: "bg-amber-100 text-amber-700",
  aprobada: "bg-emerald-100 text-emerald-700",
  rechazada: "bg-rose-100 text-rose-700",
  reportada: "bg-orange-100 text-orange-700",
  en_revision: "bg-blue-100 text-blue-700",
  en_proceso: "bg-indigo-100 text-indigo-700",
  resuelta: "bg-emerald-100 text-emerald-700",
  cerrada: "bg-slate-100 text-slate-700",
};

const ESTADOS_INC = ["reportada", "en_revision", "en_proceso", "resuelta", "cerrada", "rechazada"];

function Badge({ value }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ESTADO_BADGE[value] || "bg-muted text-muted-foreground"}`}>
      {value?.replace(/_/g, " ") || "—"}
    </span>
  );
}

function Dato({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value || "—"}</p>
    </div>
  );
}

export default function DetallePersonal({ usuario, onClose, onUpdated }) {
  const { toast } = useToast();
  const [role, setRole] = useState(null);
  const [meId, setMeId] = useState(null);
  const [loading, setLoading] = useState(true);
  const esAdmin = role === "admin";
  const esEncargado = role === "encargado";
  const puedeCorregir = esAdmin || esEncargado;
  const [datos, setDatos] = useState(usuario);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [asignaciones, setAsignaciones] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [bonos, setBonos] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [evidencias, setEvidencias] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [editSalida, setEditSalida] = useState({});
  const [editHoras, setEditHoras] = useState({});
  const [editInc, setEditInc] = useState({});
  const [repMes, setRepMes] = useState(new Date().getMonth());
  const [repAnio, setRepAnio] = useState(new Date().getFullYear());

  const load = async () => {
    if (!usuario) return;
    try {
      const [asigs, regs, bons, incs, acts, evs, hist] = await Promise.all([
        base44.entities.Asignaciones.list("-created_date", 500),
        base44.entities.Registros_QR.list("-fecha", 500),
        base44.entities.Bonos.list("-fecha", 500),
        base44.entities.Incidencias.list("-created_date", 500),
        base44.entities.Actividades.list("nombre", 200),
        base44.entities.Evidencias.filter({ usuario: usuario.id }, "-created_date", 100).catch(() => []),
        base44.entities.Historial_Areas.filter({ usuario: usuario.id }, "-created_date", 100).catch(() => []),
      ]);
      setAsignaciones(asigs.filter((a) => a.usuario === usuario.id));
      setRegistros(regs.filter((r) => r.usuario === usuario.id));
      setBonos(bons.filter((b) => b.usuario === usuario.id));
      setIncidencias(incs.filter((i) => i.usuario_afectado === usuario.id || i.usuario_afectado === usuario.email || i.creado_por === usuario.id));
      setActividades(acts);
      setEvidencias(evs || []);
      setHistorial(hist || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { base44.auth.me().then((m) => { setRole(m.role); setMeId(m.id); }).catch(() => {}); }, []);

  useEffect(() => {
    if (usuario) {
      setLoading(true);
      setDatos(usuario);
      setEditando(false);
      setEditSalida({}); setEditHoras({}); setEditInc({});
      load();
    }
  }, [usuario?.id]);

  // ---- Edición de datos personales (solo admin) ----
  const empezarEdicion = () => {
    setForm({
      nombre_completo: datos?.nombre_completo || datos?.full_name || "",
      email: datos?.email || "",
      matricula: datos?.matricula || "",
      telefono: datos?.telefono || "",
      facultad: datos?.facultad || "",
      carrera: datos?.carrera || "",
      periodo_asignado: datos?.periodo_asignado || "",
      area_asignada: datos?.area_asignada || "",
      area_encargada: datos?.area_encargada || "",
    });
    setEditando(true);
  };

  const guardarDatos = async () => {
    if (!form.nombre_completo?.trim() || !form.email?.trim()) {
      toast({ title: "Nombre y correo son obligatorios", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        nombre_completo: form.nombre_completo.trim(),
        full_name: form.nombre_completo.trim(),
        email: form.email.trim(),
        matricula: form.matricula.trim(),
        telefono: form.telefono.trim(),
        facultad: form.facultad.trim(),
        carrera: form.carrera.trim(),
        periodo_asignado: form.periodo_asignado.trim(),
        area_asignada: form.area_asignada,
        area_encargada: form.area_encargada,
      };
      const actualizado = await base44.entities.User.update(datos.id, payload);
      setDatos(actualizado);
      onUpdated?.(actualizado);
      setEditando(false);
      toast({ title: "Datos actualizados", description: actualizado.nombre_completo || actualizado.full_name });
    } catch (e) {
      toast({ title: "Error al guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const actsById = {};
  actividades.forEach((a) => { actsById[a.id] = a; });

  const totalHoras = Math.round((sumarHorasRegistros(registros) + sumarHorasBonos(bonos)) * 100) / 100;
  const horasPorValidar = sumarHorasPorValidar(registros);

  const validarRegistro = async (r) => {
    try {
      await base44.entities.Registros_QR.update(r.id, { validado: 1, validado_por: meId });
      toast({ title: "Fichaje validado", description: `${formatearFecha(r.fecha)} ya cuenta para la meta` });
      load();
    } catch (e) { toast({ title: "Error al validar", variant: "destructive" }); }
  };

  const generarReportePersonal = () => {
    const asig = asignaciones.find((a) => a.estado !== "cancelado") || asignaciones[0];
    const actividad = asig ? actsById[asig.actividad] : actividades[0];
    try {
      generarReportePdfMensual({ perfil: usuario, actividad, registros, bonos, mes: repMes, anio: repAnio });
      toast({ title: "Reporte generado", description: `${MESES[repMes]} ${repAnio}` });
    } catch (e) {
      console.error(e);
      toast({ title: "Error al generar el reporte", variant: "destructive" });
    }
  };

  // ---- Acciones ----
  const toggleBajaAsignacion = async (a) => {
    const nuevo = a.estado === "cancelado" ? "activo" : "cancelado";
    try {
      await base44.entities.Asignaciones.update(a.id, { estado: nuevo });
      toast({ title: nuevo === "cancelado" ? "Baja aplicada" : "Reactivada", description: actsById[a.actividad]?.nombre || "" });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const eliminarAsignacion = async (a) => {
    if (!(await confirmarGlobal({ titulo: "¿Eliminar esta asignación de actividad?", descripcion: "Se quita del historial del usuario.", destructivo: true }))) return;
    try {
      await base44.entities.Asignaciones.delete(a.id);
      toast({ title: "Actividad eliminada", description: actsById[a.actividad]?.nombre || "" });
      load();
    } catch (e) { toast({ title: "Error al eliminar", variant: "destructive" }); }
  };

  const guardarSalida = async (r) => {
    const salida = editSalida[r.id] ?? r.hora_salida;
    if (!salida) { toast({ title: "Hora de salida vacía", variant: "destructive" }); return; }
    try {
      await base44.entities.Registros_QR.update(r.id, { hora_salida: salida, estado_registro: "cerrado" });
      toast({ title: "Horas corregidas", description: `${calcularHoras(r.hora_entrada, salida)} h` });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const cerrarRegistro = async (r) => {
    const ahora = new Date().toTimeString().slice(0, 5);
    try {
      await base44.entities.Registros_QR.update(r.id, { hora_salida: ahora, estado_registro: "cerrado" });
      toast({ title: "Registro cerrado", description: `${calcularHoras(r.hora_entrada, ahora)} h` });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const eliminarRegistro = async (r) => {
    if (!(await confirmarGlobal({ titulo: "¿Eliminar este registro de asistencia?", descripcion: "Las horas de ese fichaje dejarán de contar.", destructivo: true }))) return;
    try { await base44.entities.Registros_QR.delete(r.id); toast({ title: "Registro eliminado" }); load(); }
    catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const guardarHorasBono = async (b) => {
    const hrs = parseFloat(editHoras[b.id] ?? b.horas);
    if (!hrs || hrs <= 0) { toast({ title: "Horas inválidas", variant: "destructive" }); return; }
    try {
      await base44.entities.Bonos.update(b.id, { horas: hrs });
      toast({ title: "Premio corregido", description: `${hrs} h` });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const eliminarBono = async (b) => {
    if (!(await confirmarGlobal({ titulo: "¿Eliminar este bono?", descripcion: "Las horas de premio se descuentan del total del usuario.", destructivo: true }))) return;
    try { await base44.entities.Bonos.delete(b.id); toast({ title: "Bono eliminado" }); load(); }
    catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const guardarIncidencia = async (i) => {
    const estado = editInc[i.id]?.estado ?? i.estado_incidencia;
    const comentario = editInc[i.id]?.comentario ?? i.comentario_resolucion ?? "";
    try {
      await base44.entities.Incidencias.update(i.id, {
        estado_incidencia: estado,
        comentario_resolucion: comentario,
        fecha_resolucion: ["resuelta", "cerrada", "rechazada"].includes(estado) ? new Date().toISOString() : i.fecha_resolucion,
      });
      toast({ title: "Incidencia actualizada" });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  return (
    <Dialog open={!!usuario} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {datos?.foto_perfil ? (
              <img src={datos.foto_perfil} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm">
                {(datos?.nombre_completo || datos?.full_name || "?").charAt(0)}
              </div>
            )}
            {datos?.nombre_completo || datos?.full_name || "—"}
          </DialogTitle>
          <DialogDescription>
            {datos?.email} · Rol: {ROL_LABEL[datos?.role] || datos?.role} · {datos?.matricula || "Sin matrícula"} ·{" "}
            <span className="font-semibold text-primary">{totalHoras} h</span> validadas
            {horasPorValidar > 0 && <> · <span className="font-semibold text-amber-600">{horasPorValidar} h</span> por validar</>}
          </DialogDescription>
        </DialogHeader>

        {!loading && (
          <div className="flex items-end gap-2 flex-wrap pb-3 border-b border-border">
            <div className="space-y-1">
              <Label className="text-xs">Mes</Label>
              <select className="h-8 rounded-md border border-input bg-background px-2 text-sm" value={repMes} onChange={(e) => setRepMes(Number(e.target.value))}>
                {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Año</Label>
              <Input type="number" value={repAnio} onChange={(e) => setRepAnio(Number(e.target.value))} className="h-8 w-24" />
            </div>
            <Button size="sm" onClick={generarReportePersonal}><FileDown className="h-3.5 w-3.5 mr-1" /> Reporte personal</Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>
        ) : (
          <Tabs defaultValue="datos">
            <TabsList className="w-full justify-start flex-wrap h-auto">
              <TabsTrigger value="datos" className="flex-1"><IdCard className="h-4 w-4 mr-1.5" /> Datos</TabsTrigger>
              <TabsTrigger value="actividades" className="flex-1"><FolderKanban className="h-4 w-4 mr-1.5" /> Actividades</TabsTrigger>
              <TabsTrigger value="asistencias" className="flex-1"><Clock className="h-4 w-4 mr-1.5" /> Fichaje</TabsTrigger>
              <TabsTrigger value="evidencias" className="flex-1"><ImageIcon className="h-4 w-4 mr-1.5" /> Evidencias</TabsTrigger>
              <TabsTrigger value="premios" className="flex-1"><Award className="h-4 w-4 mr-1.5" /> Premios</TabsTrigger>
              <TabsTrigger value="incidencias" className="flex-1"><AlertTriangle className="h-4 w-4 mr-1.5" /> Incidencias</TabsTrigger>
              <TabsTrigger value="historial" className="flex-1"><History className="h-4 w-4 mr-1.5" /> Historial</TabsTrigger>
            </TabsList>

            {/* DATOS PERSONALES */}
            <TabsContent value="datos" className="mt-3">
              {!editando ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    <Dato label="Nombre completo" value={datos?.nombre_completo || datos?.full_name} />
                    <Dato label="Correo" value={datos?.email} />
                    <Dato label="Rol" value={ROL_LABEL[datos?.role] || datos?.role} />
                    <Dato label="Tipo de participante" value={datos?.tipo_participante?.replace(/_/g, " ")} />
                    <Dato label="Matrícula" value={datos?.matricula} />
                    <Dato label="Teléfono" value={datos?.telefono} />
                    <Dato label="Facultad" value={datos?.facultad} />
                    <Dato label="Carrera" value={datos?.carrera} />
                    <Dato label="Periodo / cohorte" value={datos?.periodo_asignado} />
                    <Dato
                      label={datos?.role === "encargado" ? "Área que encarga" : "Área asignada"}
                      value={labelArea(datos?.role === "encargado" ? datos?.area_encargada : datos?.area_asignada)}
                    />
                    {datos?.area_asignada === "Bodega" && (
                      <Dato label="Etiqueta de bodega" value={labelEtiqueta(datos?.etiqueta) || "Sin etiqueta"} />
                    )}
                    <Dato label="Estado" value={datos?.archivado ? "Baja (archivado)" : "Activo"} />
                    {!!datos?.archivado && (
                      <>
                        <Dato label="Fecha de baja" value={formatearFecha(datos?.fecha_baja)} />
                        <Dato label="Motivo de baja" value={datos?.motivo_baja} />
                      </>
                    )}
                    <Dato label="Miembro desde" value={formatearFecha(datos?.created_date)} />
                  </div>
                  {esAdmin && (
                    <div className="pt-2 border-t border-border">
                      <Button size="sm" variant="outline" onClick={empezarEdicion}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar datos
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Nombre completo *</Label>
                      <Input value={form.nombre_completo} onChange={(e) => setForm((f) => ({ ...f, nombre_completo: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Correo *</Label>
                      <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} autoComplete="off" name="email-editar-personal" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Matrícula</Label>
                      <Input value={form.matricula} onChange={(e) => setForm((f) => ({ ...f, matricula: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Teléfono</Label>
                      <Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Facultad</Label>
                      <Input value={form.facultad} onChange={(e) => setForm((f) => ({ ...f, facultad: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Carrera</Label>
                      <Input value={form.carrera} onChange={(e) => setForm((f) => ({ ...f, carrera: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Periodo / cohorte</Label>
                      <Input value={form.periodo_asignado} onChange={(e) => setForm((f) => ({ ...f, periodo_asignado: e.target.value }))} placeholder="Ej. Ago-Dic 2026" />
                    </div>
                    {datos?.role === "encargado" ? (
                      <div className="space-y-1">
                        <Label className="text-xs">Área que encarga</Label>
                        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.area_encargada} onChange={(e) => setForm((f) => ({ ...f, area_encargada: e.target.value }))}>
                          <option value="">Sin área</option>
                          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                      </div>
                    ) : (esParticipante(datos?.role)) && (
                      <div className="space-y-1">
                        <Label className="text-xs">Área asignada</Label>
                        <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.area_asignada} onChange={(e) => setForm((f) => ({ ...f, area_asignada: e.target.value }))}>
                          <option value="">Sin área</option>
                          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button size="sm" disabled={guardando} onClick={guardarDatos}>
                      <Save className="h-3.5 w-3.5 mr-1.5" /> {guardando ? "Guardando..." : "Guardar cambios"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={guardando} onClick={() => setEditando(false)}>
                      <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ACTIVIDADES */}
            <TabsContent value="actividades" className="space-y-2 mt-3">
              {asignaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin actividades asignadas.</p>
              ) : asignaciones.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{actsById[a.actividad]?.nombre || "Actividad"}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {formatearFecha(a.fecha_inicio)}</p>
                  </div>
                  <Badge value={a.estado} />
                  {puedeCorregir && (
                    <Button
                      size="sm"
                      variant={a.estado === "cancelado" ? "outline" : "secondary"}
                      onClick={() => toggleBajaAsignacion(a)}
                    >
                      {a.estado === "cancelado" ? (<><RefreshCw className="h-3.5 w-3.5 mr-1" /> Reactivar</>) : (<><UserX className="h-3.5 w-3.5 mr-1" /> Dar de baja</>)}
                    </Button>
                  )}
                  {esAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => eliminarAsignacion(a)} className="text-rose-600" title="Eliminar asignación">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </TabsContent>

            {/* ASISTENCIAS */}
            <TabsContent value="asistencias" className="space-y-2 mt-3">
              {registros.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin registros de asistencia.</p>
              ) : registros.map((r) => {
                const salida = editSalida[r.id] ?? r.hora_salida ?? "";
                const horas = r.hora_entrada && salida ? calcularHoras(r.hora_entrada, salida) : 0;
                return (
                  <div key={r.id} className="p-3 rounded-lg border border-border space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="text-sm font-medium">{formatearFecha(r.fecha)}</p>
                      <Badge value={r.estado_registro} />
                      {r.es_manual ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">manual</span> : null}
                      {r.estado_registro !== "abierto" && (
                        r.validado ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">validado</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">por validar</span>
                        )
                      )}
                      <span className="text-xs text-muted-foreground">Entrada: <b>{r.hora_entrada || "—"}</b></span>
                      <span className="text-xs text-muted-foreground">Horas: <b className="text-primary">{horas} h</b></span>
                    </div>
                    {(esAdmin || (puedeCorregir && r.estado_registro !== "abierto" && !r.validado)) && (
                      <div className="flex items-end gap-2 flex-wrap">
                        {esAdmin && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs">Corregir salida</Label>
                              <Input type="time" value={salida} onChange={(e) => setEditSalida((s) => ({ ...s, [r.id]: e.target.value }))} className="h-8 w-32" />
                            </div>
                            <Button size="sm" onClick={() => guardarSalida(r)}><Save className="h-3.5 w-3.5 mr-1" /> Guardar</Button>
                            {r.estado_registro === "abierto" && (
                              <Button size="sm" variant="secondary" onClick={() => cerrarRegistro(r)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Cerrar ahora</Button>
                            )}
                          </>
                        )}
                        {puedeCorregir && r.estado_registro !== "abierto" && !r.validado && (
                          <Button size="sm" variant="outline" onClick={() => validarRegistro(r)} className="text-emerald-700 border-emerald-300">
                            <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Validar
                          </Button>
                        )}
                        {esAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => eliminarRegistro(r)} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>

            {/* PREMIOS */}
            <TabsContent value="premios" className="space-y-2 mt-3">
              {bonos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin horas de premio.</p>
              ) : bonos.map((b) => {
                const hrs = editHoras[b.id] ?? b.horas ?? "";
                return (
                  <div key={b.id} className="p-3 rounded-lg border border-border space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Award className="h-4 w-4 text-accent" />
                      <p className="text-sm font-medium flex-1 min-w-0 truncate">{b.motivo || "Premio"}</p>
                      <span className="text-xs text-muted-foreground">{formatearFecha(b.fecha)}</span>
                    </div>
                    {esAdmin && (
                      <div className="flex items-end gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Horas</Label>
                          <Input type="number" min="0" step="0.5" value={hrs} onChange={(e) => setEditHoras((h) => ({ ...h, [b.id]: e.target.value }))} className="h-8 w-28" />
                        </div>
                        <Button size="sm" onClick={() => guardarHorasBono(b)}><Save className="h-3.5 w-3.5 mr-1" /> Corregir</Button>
                        <Button size="sm" variant="ghost" onClick={() => eliminarBono(b)} className="text-rose-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>

            {/* INCIDENCIAS */}
            <TabsContent value="incidencias" className="space-y-2 mt-3">
              {incidencias.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin incidencias.</p>
              ) : incidencias.map((i) => {
                const ed = editInc[i.id] || {};
                return (
                  <div key={i.id} className="p-3 rounded-lg border border-border space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <p className="text-sm font-medium capitalize">{i.tipo_incidencia?.replace(/_/g, " ")}</p>
                      <Badge value={i.estado_incidencia} />
                      <span className="text-xs text-muted-foreground capitalize">Prioridad: {i.prioridad}</span>
                    </div>
                    {i.descripcion && <p className="text-xs text-muted-foreground">{i.descripcion}</p>}
                    {esAdmin && (
                      <div className="flex items-end gap-2 flex-wrap">
                        <div className="space-y-1">
                          <Label className="text-xs">Estado</Label>
                          <select
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={ed.estado ?? i.estado_incidencia}
                            onChange={(e) => setEditInc((p) => ({ ...p, [i.id]: { ...p[i.id], estado: e.target.value } }))}
                          >
                            {ESTADOS_INC.map((s) => <option key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1 flex-1 min-w-[180px]">
                          <Label className="text-xs">Comentario / resolución</Label>
                          <Textarea rows={1} value={ed.comentario ?? i.comentario_resolucion ?? ""} onChange={(e) => setEditInc((p) => ({ ...p, [i.id]: { ...p[i.id], comentario: e.target.value } }))} className="min-h-[32px]" />
                        </div>
                        <Button size="sm" onClick={() => guardarIncidencia(i)}><Save className="h-3.5 w-3.5 mr-1" /> Guardar</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </TabsContent>
            {/* EVIDENCIAS */}
            <TabsContent value="evidencias" className="space-y-2 mt-3">
              {evidencias.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin evidencias enviadas.</p>
              ) : evidencias.map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg border border-border flex items-start gap-3">
                  {ev.archivo_url && (ev.archivo_url.startsWith("data:image") || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(ev.archivo_url)) ? (
                    <a href={ev.archivo_url} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={ev.archivo_url} alt="" className="h-14 w-14 rounded-lg object-cover border border-border" />
                    </a>
                  ) : ev.archivo_url ? (
                    <a href={ev.archivo_url} target="_blank" rel="noreferrer" className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0" title="Abrir enlace">
                      <ExternalLink className="h-5 w-5 text-muted-foreground" />
                    </a>
                  ) : (
                    <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate">{ev.titulo || ev.descripcion?.slice(0, 60) || "Evidencia"}</p>
                      <Badge value={ev.estado_evidencia} />
                    </div>
                    {ev.descripcion && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ev.descripcion}</p>}
                    <p className="text-[10px] text-muted-foreground/70 mt-1">{formatearFecha(ev.created_date)}</p>
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* HISTORIAL */}
            <TabsContent value="historial" className="space-y-2 mt-3">
              {historial.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin cambios de área o rol registrados.</p>
              ) : historial.map((h) => (
                <div key={h.id} className="p-3 rounded-lg border border-border flex items-center gap-3 flex-wrap">
                  <History className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm">
                    <span className="font-medium capitalize">{{ area_asignada: "Área asignada", area_encargada: "Área encargada", role: "Rol" }[h.campo] || h.campo}</span>
                    {": "}
                    <span className="text-muted-foreground">{h.valor_anterior || "—"}</span>
                    {" → "}
                    <span className="font-medium text-primary">{h.valor_nuevo || "—"}</span>
                  </p>
                  <span className="text-xs text-muted-foreground ml-auto">{formatearFecha(h.created_date)}</span>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}