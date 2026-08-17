import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Loader2, Search, Download } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatearFecha } from "@/lib/ucpUtils";

const MODULOS = ["Certificados", "Evaluaciones", "Inventario", "Incidencias", "Evidencias", "Fichaje", "Usuarios", "Pase de lista", "Sistema"];

export default function AdminBitacora() {
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroModulo, setFiltroModulo] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");

  useEffect(() => {
    base44.entities.Bitacora_Auditoria.list("-created_date", 500).then((data) => {
      setRegistros(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtrados = registros.filter((r) => {
    const txt = (r.usuario_nombre + " " + r.accion + " " + (r.detalle || "") + " " + r.modulo).toLowerCase();
    const matchBus = txt.includes(busqueda.toLowerCase());
    const matchMod = !filtroModulo || r.modulo === filtroModulo;
    const matchAcc = !filtroAccion || (r.accion || "").toLowerCase().includes(filtroAccion.toLowerCase());
    const matchFecha = !fechaDesde || (r.fecha && r.fecha >= fechaDesde);
    return matchBus && matchMod && matchAcc && matchFecha;
  });

  const exportarCSV = () => {
    const headers = ["Fecha", "Usuario", "Acción", "Módulo", "Detalle"];
    const rows = filtrados.map((r) => [
      r.fecha || "",
      r.usuario_nombre || "",
      r.accion || "",
      r.modulo || "",
      (r.detalle || "").replace(/"/g, "'"),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => '"' + c + '"').join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bitacora_auditoria.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" /> Bitácora de Auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Registro inmutable de acciones críticas del sistema.</p>
        </div>
        <Button variant="outline" onClick={exportarCSV}><Download className="h-4 w-4 mr-2" /> Exportar CSV</Button>
      </div>

      <SectionCard title="Registros de auditoría" subtitle={filtrados.length + " registros"}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 w-40" placeholder="Buscar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtroModulo} onChange={(e) => setFiltroModulo(e.target.value)}>
              <option value="">Todo módulo</option>
              {MODULOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <Input className="w-32" placeholder="Acción" value={filtroAccion} onChange={(e) => setFiltroAccion(e.target.value)} />
            <Input type="date" className="w-36" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
        ) : filtrados.length === 0 ? (
          <EmptyState title="Sin registros" message="No hay acciones registradas que coincidan con el filtro." icon={ShieldCheck} />
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-1">
            {filtrados.map((r) => (
              <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><ShieldCheck className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{r.accion}</p>
                    <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{r.modulo}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.usuario_nombre} · {formatearFecha(r.fecha)} {r.fecha ? "· " + new Date(r.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </p>
                  {r.detalle && <p className="text-xs text-muted-foreground italic mt-1">{r.detalle}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}