import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { AlertTriangle, Check, X } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import GrupoColapsable from "@/components/ucp/GrupoColapsable";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { confirmarGlobal } from "@/components/ucp/ConfirmDialog";
import { formatearFecha } from "@/lib/ucpUtils";

const ACCIONES = ["amonestacion", "suspension", "baja", "capacitacion", "ninguna", "otro"];
const PENDIENTES = ["reportada", "en_revision", "en_proceso"];

const fechaMexico = (iso) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(iso));
  } catch { return ""; }
};

export default function AdminIncidencias() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [incidencias, setIncidencias] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [atenderId, setAtenderId] = useState(null);
  const [form, setForm] = useState({ comentario_resolucion: "", accion_tomada: "ninguna" });
  const [agrupar, setAgrupar] = useState("ninguno");

  const load = async () => {
    try {
      const [incs, us] = await Promise.all([
        base44.entities.Incidencias.list("-created_date", 500),
        base44.entities.User.list("full_name", 500),
      ]);
      setIncidencias(incs);
      setUsers(us);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const atender = async (inc) => {
    if (!form.comentario_resolucion) { toast({ title: "Agrega resolución", variant: "destructive" }); return; }
    await base44.entities.Incidencias.update(inc.id, {
      asignado_a: user.id,
      estado_incidencia: "resuelta",
      comentario_resolucion: form.comentario_resolucion,
      accion_tomada: form.accion_tomada,
      fecha_resolucion: new Date().toISOString(),
    });
    toast({ title: "Incidencia resuelta" });
    setAtenderId(null); setForm({ comentario_resolucion: "", accion_tomada: "ninguna" });
    load();
  };

  const rechazar = async (inc) => {
    if (!(await confirmarGlobal({ titulo: "¿Rechazar esta incidencia?", destructivo: true }))) return;
    await base44.entities.Incidencias.update(inc.id, { estado_incidencia: "rechazada", asignado_a: user.id });
    toast({ title: "Incidencia rechazada" });
    load();
  };

  const nombreDe = (id) => {
    const u = users.find((x) => x.id === id);
    return u?.nombre_completo || u?.full_name || "—";
  };

  const grupoKey = (inc) => {
    if (agrupar === "persona") return inc.usuario_afectado || "sin_persona";
    if (agrupar === "dia") return fechaMexico(inc.created_date) || "sin_fecha";
    return "todos";
  };
  const grupoLabel = (key) => {
    if (agrupar === "persona") return key === "sin_persona" ? "Sin persona asignada" : nombreDe(key);
    if (agrupar === "dia") return formatearFecha(key);
    return "";
  };

  const agruparLista = (lista) => {
    if (agrupar === "ninguno") return [{ key: "todos", label: "", items: lista }];
    const map = new Map();
    lista.forEach((inc) => {
      const k = grupoKey(inc);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(inc);
    });
    return Array.from(map.entries()).map(([key, items]) => ({ key, label: grupoLabel(key), items }));
  };

  const pendientes = incidencias.filter((i) => PENDIENTES.includes(i.estado_incidencia));
  const otras = incidencias.filter((i) => !PENDIENTES.includes(i.estado_incidencia));
  const esAgrupado = agrupar !== "ninguno";

  const renderPendiente = (inc) => {
    const creador = users.find((x) => x.id === inc.creado_por);
    return (
      <div key={inc.id} className="bg-card rounded-2xl border border-border shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 capitalize">{inc.tipo_incidencia}</span>
            <StatusBadge status={inc.prioridad} type="prioridad" />
          </div>
          <StatusBadge status={inc.estado_incidencia} />
        </div>
        {(!esAgrupado || agrupar !== "persona") && (
          <p className="text-sm font-medium">{nombreDe(inc.usuario_afectado)}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">{inc.descripcion}</p>
        <p className="text-xs text-muted-foreground mt-2">Reportada por {nombreDe(inc.creado_por)} · {formatearFecha(inc.created_date)}</p>
        {atenderId === inc.id ? (
          <div className="mt-3 space-y-2 bg-muted/30 p-3 rounded-lg">
            <div>
              <Label className="mb-1.5 block">Resolución</Label>
              <Textarea value={form.comentario_resolucion} onChange={(e) => setForm({ ...form, comentario_resolucion: e.target.value })} rows={2} placeholder="Describe la resolución..." />
            </div>
            <div>
              <Label className="mb-1.5 block">Acción tomada</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.accion_tomada} onChange={(e) => setForm({ ...form, accion_tomada: e.target.value })}>
                {ACCIONES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => atender(inc)}><Check className="h-4 w-4 mr-1" /> Resolver</Button>
              <Button size="sm" variant="outline" onClick={() => setAtenderId(null)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => setAtenderId(inc.id)}>Atender</Button>
            <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => rechazar(inc)}><X className="h-4 w-4 mr-1" /> Rechazar</Button>
          </div>
        )}
      </div>
    );
  };

  const renderOtra = (inc) => (
    <div key={inc.id} className="bg-card rounded-2xl border border-border shadow-sm p-4 opacity-75">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 capitalize">{inc.tipo_incidencia}</span>
          <StatusBadge status={inc.estado_incidencia} />
        </div>
        <span className="text-xs text-muted-foreground">{formatearFecha(inc.created_date)}</span>
      </div>
      <p className="text-sm mt-1">
        {(agrupar !== "persona") && `${nombreDe(inc.usuario_afectado)} — `}
        {inc.descripcion}
      </p>
      {inc.comentario_resolucion && <p className="text-xs text-emerald-700 mt-1">Resolución: {inc.comentario_resolucion}</p>}
    </div>
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  const gruposPend = agruparLista(pendientes);
  const gruposOtras = agruparLista(otras.slice(0, 30));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Bandeja de incidencias</h1>
          <p className="text-sm text-muted-foreground mt-1">{pendientes.length} pendiente(s) · {otras.length} resuelta(s)/rechazada(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Agrupar por</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value)}
          >
            <option value="ninguno">Sin agrupar</option>
            <option value="persona">Persona</option>
            <option value="dia">Día</option>
          </select>
        </div>
      </div>

      {pendientes.length === 0 && otras.length === 0 ? (
        <SectionCard><EmptyState title="Sin incidencias" message="No hay incidencias reportadas." icon={AlertTriangle} /></SectionCard>
      ) : (
        <>
          {pendientes.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Pendientes</h2>
              {esAgrupado
                ? gruposPend.map((g) => (
                    <GrupoColapsable key={g.key} titulo={g.label} contador={g.items.length} defaultOpen>
                      {g.items.map(renderPendiente)}
                    </GrupoColapsable>
                  ))
                : gruposPend[0].items.map(renderPendiente)}
            </div>
          )}
          {otras.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mt-6">Resueltas / Rechazadas</h2>
              {esAgrupado
                ? gruposOtras.map((g) => (
                    <GrupoColapsable key={g.key} titulo={g.label} contador={g.items.length} defaultOpen={false}>
                      {g.items.map(renderOtra)}
                    </GrupoColapsable>
                  ))
                : gruposOtras[0].items.map(renderOtra)}
            </div>
          )}
        </>
      )}
    </div>
  );
}