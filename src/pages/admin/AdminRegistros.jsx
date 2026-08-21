import React, { useState, useEffect } from "react";
import { ListaSkeleton } from "@/components/ucp/Skeleton";
import { base44 } from "@/api/base44Client";
import useRecargarAlVolver from "@/hooks/useRecargarAlVolver";
import { useAuth } from "@/lib/AuthContext";
import { ClipboardCheck, LogOut, Download, AlertTriangle } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { calcularHoras, formatearFecha, horaActual } from "@/lib/ucpUtils";
import { labelArea } from "@/lib/areas";
import { cerrarRegistroConIncidencia } from "@/lib/cerrarFichaje";

export default function AdminRegistros() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [registros, setRegistros] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [comentario, setComentario] = useState("");
  const [filtro, setFiltro] = useState("abierto");
  const [incidencias, setIncidencias] = useState([]);

  const load = async () => {
    try {
      const [regs, us, incs] = await Promise.all([
        base44.entities.Registros_QR.list("-fecha", 500),
        base44.entities.User.list("full_name", 500),
        base44.entities.Incidencias.list("-created_date", 500),
      ]);
      setRegistros(regs);
      setUsers(us);
      setIncidencias(incs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useRecargarAlVolver(load);

  const marcarSalida = async (reg) => {
    const salida = horaActual();
    const u = users.find(x => x.id === reg.usuario);
    const horas = calcularHoras(reg.hora_entrada, salida);
    try {
      const { incidenciaGenerada } = await cerrarRegistroConIncidencia({
        registro: reg, salida, horas, comentario, rolUsuario: u?.role, modificadoPor: user.id,
      });
      toast({ title: "Salida marcada", description: incidenciaGenerada ? "Se generó una incidencia con tu comentario." : undefined });
    } catch (e) { toast({ title: "Error al cerrar", variant: "destructive" }); }
    setEditId(null); setComentario("");
    load();
  };

  const exportarCSV = () => {
    const rows = [["Fecha", "Alumno", "Entrada", "Salida", "Horas", "Estado"]];
    filtered.forEach(r => {
      const u = users.find(x => x.id === r.usuario);
      const hrs = r.hora_salida ? calcularHoras(r.hora_entrada, r.hora_salida) : 0;
      rows.push([r.fecha, u?.nombre_completo || u?.full_name || "", r.hora_entrada, r.hora_salida || "", hrs, r.estado_registro]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "registros.csv"; a.click();
  };

  const filtered = filtro === "abierto"
    ? registros.filter(r => r.estado_registro === "abierto")
    : filtro === "cerrado"
      ? registros.filter(r => r.estado_registro === "cerrado" || r.estado_registro === "incompleto")
      : filtro === "por_validar"
        ? registros.filter(r => (r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && !r.validado)
        : registros;

  const validar = async (r) => {
    try {
      await base44.entities.Registros_QR.update(r.id, { validado: 1, validado_por: user.id });
      toast({ title: "Fichaje validado", description: "Las horas ya cuentan para la meta del alumno" });
      load();
    } catch (e) { toast({ title: "Error al validar", variant: "destructive" }); }
  };

  const quitarValidacion = async (r) => {
    try {
      await base44.entities.Registros_QR.update(r.id, { validado: 0, validado_por: "" });
      toast({ title: "Validación retirada" });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  if (loading) return <div className="py-6"><ListaSkeleton filas={4} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Registros</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} registro(s)</p>
        </div>
        <div className="flex gap-2">
          <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="abierto">Abiertos</option>
            <option value="por_validar">Por validar</option>
            <option value="cerrado">Cerrados</option>
            <option value="todos">Todos</option>
          </select>
          <Button variant="outline" onClick={exportarCSV}><Download className="h-4 w-4 mr-2" /> CSV</Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <SectionCard><EmptyState title="Sin registros" message="No hay registros en este filtro." icon={ClipboardCheck} /></SectionCard>
      ) : (
        <div className="space-y-3">
          {filtered.slice(0, 50).map((r) => {
            const u = users.find(x => x.id === r.usuario);
            const hrs = r.hora_salida ? calcularHoras(r.hora_entrada, r.hora_salida) : 0;
            return (
              <div key={r.id} className="bg-card rounded-2xl border border-border shadow-sm p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm">
                      {(u?.nombre_completo || u?.full_name || "?").charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{u?.nombre_completo || u?.full_name || "—"}</p>
                      <p className="text-xs text-muted-foreground">{formatearFecha(r.fecha)} · {r.hora_entrada} → {r.hora_salida || "—"} {r.estado_registro === "cerrado" && `· ${hrs}h`}{r.area ? ` · ${labelArea(r.area) || r.area}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.es_manual ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600">manual</span> : null}
                    <StatusBadge status={r.estado_registro} />
                    {(r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && (
                      r.validado ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">validado</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">por validar</span>
                      )
                    )}
                    {(r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && (
                      r.validado ? (
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => quitarValidacion(r)} title="Quitar validación">Quitar validación</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="text-emerald-700 border-emerald-300" onClick={() => validar(r)}>Validar</Button>
                      )
                    )}
                    {r.estado_registro === "abierto" && (
                      editId === r.id ? (
                        <div className="flex gap-2 items-end">
                          <Textarea placeholder="Comentario" value={comentario} onChange={(e) => setComentario(e.target.value)} rows={1} className="w-48" />
                          <Button size="sm" onClick={() => marcarSalida(r)}>Confirmar</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditId(null); setComentario(""); }}>X</Button>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => setEditId(r.id)}><LogOut className="h-4 w-4 mr-1" /> Marcar salida</Button>
                      )
                    )}
                  </div>
                </div>
                {r.comentario_admin && <p className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded">Comentario: {r.comentario_admin}</p>}
                {(() => {
                  const inc = incidencias.find(i => i.registro === r.id);
                  if (!inc) return null;
                  return (
                    <p className="text-xs mt-2 bg-orange-50 border border-orange-200 p-2 rounded text-orange-800 flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>Incidencia ({inc.tipo_incidencia?.replace(/_/g, " ")}): {inc.descripcion}</span>
                    </p>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}