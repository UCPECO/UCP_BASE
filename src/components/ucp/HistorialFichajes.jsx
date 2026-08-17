import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Clock, LogIn, LogOut } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import { calcularHoras, formatearFecha } from "@/lib/ucpUtils";

export default function HistorialFichajes() {
  const { user } = useAuth();
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    base44.entities.Registros_QR.filter({ usuario: user.id }, "-fecha", 500)
      .then(setRegistros)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user?.id]);

  const filtrados = registros.filter(r => !filtroEstado || r.estado_registro === filtroEstado);
  const totalHoras = filtrados.reduce(
    (acc, r) => r.estado_registro === "cerrado" ? acc + (calcularHoras(r.hora_entrada, r.hora_salida) || 0) : acc, 0
  );
  const totalSesiones = filtrados.filter(r => r.estado_registro === "cerrado").length;

  return (
    <SectionCard title="Historial de fichajes QR" subtitle="Entradas y salidas registradas para verificar tus horas">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-3">
          <div className="rounded-lg bg-emerald-50 px-4 py-2">
            <p className="text-xs text-emerald-700">Horas acumuladas</p>
            <p className="text-lg font-bold text-emerald-800">{Math.round(totalHoras * 100) / 100}h</p>
          </div>
          <div className="rounded-lg bg-blue-50 px-4 py-2">
            <p className="text-xs text-blue-700">Sesiones cerradas</p>
            <p className="text-lg font-bold text-blue-800">{totalSesiones}</p>
          </div>
        </div>
        <select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="abierto">Abierto</option>
          <option value="cerrado">Cerrado</option>
          <option value="incompleto">Incompleto</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>
      ) : filtrados.length === 0 ? (
        <EmptyState title="Sin fichajes" message="Aún no has registrado entradas ni salidas." icon={Clock} />
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="px-2 py-2 font-medium">Fecha</th>
                <th className="px-2 py-2 font-medium">Entrada</th>
                <th className="px-2 py-2 font-medium">Salida</th>
                <th className="px-2 py-2 font-medium">Horas</th>
                <th className="px-2 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(r => {
                const hrs = r.estado_registro === "cerrado" ? calcularHoras(r.hora_entrada, r.hora_salida) : null;
                return (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="px-2 py-2.5">{formatearFecha(r.fecha)}</td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-1"><LogIn className="h-3.5 w-3.5 text-emerald-600" />{r.hora_entrada}</span></td>
                    <td className="px-2 py-2.5"><span className="inline-flex items-center gap-1"><LogOut className="h-3.5 w-3.5 text-rose-600" />{r.hora_salida || "—"}</span></td>
                    <td className="px-2 py-2.5 font-medium">{hrs != null ? `${hrs}h` : "—"}</td>
                    <td className="px-2 py-2.5"><StatusBadge status={r.estado_registro} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}