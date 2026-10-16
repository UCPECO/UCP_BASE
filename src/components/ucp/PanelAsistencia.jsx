import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck, ChevronLeft, ChevronRight, Users, CalendarDays, Clock,
  TrendingUp, Download, AlertTriangle, RefreshCw, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionCard from "@/components/ucp/SectionCard";
import KpiCard from "@/components/ucp/KpiCard";
import EmptyState from "@/components/ucp/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { AREAS, labelArea } from "@/lib/areas";
import asistencia, { desplazarPeriodo, periodoActual, etiquetaPeriodo, descargarCsv } from "@/api/asistenciaClient";

const INICIAL_DIA = { Domingo: "D", Lunes: "L", Martes: "M", Miércoles: "X", Jueves: "J", Viernes: "V", Sábado: "S" };
const ORDEN_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const pad = (n) => String(n).padStart(2, "0");

// Pestañas compartidas con la vista de disponibilidad declarada
export function PestanasAsistencia({ valor, onChange }) {
  const opciones = [
    { id: "asistencia", label: "Asistencia real", icon: CalendarCheck },
    { id: "declarada", label: "Disponibilidad declarada", icon: CalendarDays },
  ];
  return (
    <div className="inline-flex rounded-xl border border-border bg-card p-1 gap-1" role="tablist" aria-label="Vista de asistencia">
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={valor === o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            valor === o.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <o.icon className="h-4 w-4" /> {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PanelAsistencia({ onCambiarPestana }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [periodo, setPeriodo] = useState(periodoActual);
  const [area, setArea] = useState("");
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [expandida, setExpandida] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await asistencia.porPersona({ periodo, area: area || undefined });
      setData(r);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la asistencia");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [periodo, area]);

  useEffect(() => { cargar(); }, [cargar]);

  // Días del mes y conjunto de días hábiles, para pintar la matriz
  const dias = useMemo(() => {
    if (!data) return [];
    const d = new Date(`${data.desde}T00:00:00`);
    const fin = new Date(`${data.hasta}T00:00:00`);
    if (Number.isNaN(d.getTime()) || Number.isNaN(fin.getTime())) return [];
    const out = [];
    while (d <= fin) {
      out.push({ iso: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, num: d.getDate(), dia: d.getDay() });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [data]);

  const habiles = useMemo(() => new Set(data?.dias_habiles || []), [data]);
  const maxDiaSemana = useMemo(
    () => Math.max(1, ...ORDEN_DIAS.map((d) => data?.por_dia_semana?.[d] || 0)),
    [data]
  );

  const exportar = () => {
    if (!data?.personas?.length) {
      toast({ title: "No hay datos que exportar", variant: "destructive" });
      return;
    }
    const encabezado = ["Nombre", "Matrícula", "Rol", "Área", "Días asistidos", "Días hábiles", "Cumplimiento %", "Horas", "Fichajes manuales", "Día habitual", "Fechas"];
    const filas = [encabezado, ...data.personas.map((p) => [
      p.nombre, p.matricula || "", p.role, p.area ? (labelArea(p.area) || p.area) : "",
      p.total_dias, data.total_dias_habiles, p.cumplimiento ?? "", p.horas,
      p.fichajes_manuales, p.dia_habitual || "", p.dias.join(" | "),
    ])];
    descargarCsv(`asistencia-${data.periodo}`, filas);
    toast({ title: "CSV descargado", description: `${data.personas.length} persona(s), ${data.periodo}` });
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground flex items-center gap-2">
            <CalendarCheck className="h-6 w-6 text-primary" /> Asistencia del personal
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Qué días concurre realmente cada persona, calculado desde sus fichajes.
          </p>
        </div>
        {onCambiarPestana && (
          <PestanasAsistencia valor="asistencia" onChange={onCambiarPestana} />
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
          <button type="button" onClick={() => setPeriodo((p) => desplazarPeriodo(p, -1))} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="month"
            value={periodo}
            onChange={(e) => e.target.value && setPeriodo(e.target.value)}
            className="bg-transparent px-2 py-1 text-sm font-medium text-foreground"
            aria-label="Mes a consultar"
          />
          <button type="button" onClick={() => setPeriodo((p) => desplazarPeriodo(p, 1))} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {user?.role === "admin" && (
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
            aria-label="Filtrar por área"
          >
            <option value="">Todas las áreas</option>
            {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        )}

        <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> {cargando ? "Cargando…" : "Actualizar"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!data?.personas?.length}>
          <Download className="h-4 w-4 mr-1.5" /> Exportar CSV
        </Button>
        <span className="text-sm text-muted-foreground capitalize">{etiquetaPeriodo(periodo)}</span>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="underline font-medium shrink-0" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {cargando && !data ? (
        <div className="space-y-3" aria-busy="true">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
          </div>
          <div className="skeleton h-64 rounded-2xl" />
        </div>
      ) : !data ? null : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard icon={Users} label="Personas" value={data.resumen.total_personas} hint={`${data.resumen.con_asistencia} con asistencia`} />
            <KpiCard icon={CalendarCheck} label="Asistencias" value={data.resumen.total_asistencias} hint="días-persona" tone="accent" />
            <KpiCard icon={TrendingUp} label="Promedio de días" value={data.resumen.promedio_dias} hint={`de ${data.total_dias_habiles} hábiles`} tone="blue" />
            <KpiCard icon={Clock} label="Horas registradas" value={data.resumen.total_horas} tone="primary" />
            <KpiCard icon={AlertTriangle} label="Sin asistencia" value={data.resumen.sin_asistencia} hint="en el mes" tone={data.resumen.sin_asistencia > 0 ? "accent" : "primary"} />
          </div>

          {/* Qué días concurre más gente: la pregunta central, respondida primero */}
          <SectionCard title="Qué días concurren" subtitle={`Asistencias por día de la semana en ${etiquetaPeriodo(data.periodo)}`} icon={CalendarDays}>
            <div className="space-y-2">
              {ORDEN_DIAS.map((d) => {
                const n = data.por_dia_semana?.[d] || 0;
                const pct = Math.round((n / maxDiaSemana) * 100);
                const esHabil = habiles.size > 0 && data.dias_habiles.some((iso) => {
                  const dt = new Date(`${iso}T00:00:00`);
                  return !Number.isNaN(dt.getTime()) && ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][dt.getDay()] === d;
                });
                return (
                  <div key={d} className="flex items-center gap-3">
                    <span className={`w-20 shrink-0 text-sm ${esHabil ? "text-foreground" : "text-muted-foreground"}`}>{d}</span>
                    <div className="flex-1 h-5 rounded-md bg-muted/50 overflow-hidden">
                      <div
                        className={`h-full rounded-md transition-all ${esHabil ? "bg-primary/70" : "bg-muted-foreground/30"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{n}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {/* Matriz persona x día */}
          <SectionCard
            title="Calendario de asistencia"
            subtitle="Cada celda es un día del mes. Toca una persona para ver el detalle de sus fichajes."
            icon={FileSpreadsheet}
          >
            {data.personas.length === 0 ? (
              <EmptyState
                title="Sin personas que mostrar"
                message={area ? `Nadie del área ${labelArea(area) || area} en este periodo.` : "No hay personal activo en este periodo."}
                icon={Users}
              />
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-card text-left font-medium text-xs uppercase tracking-wide text-muted-foreground pr-3 pb-2 min-w-[12rem]">
                        Persona
                      </th>
                      {dias.map((d) => (
                        <th key={d.iso} className={`pb-2 px-0 text-center font-medium text-[10px] w-6 ${habiles.has(d.iso) ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
                          <span className="block leading-tight">{INICIAL_DIA[["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d.dia]]}</span>
                          <span className="block leading-tight tabular-nums">{d.num}</span>
                        </th>
                      ))}
                      <th className="pb-2 pl-3 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">Días</th>
                      <th className="pb-2 pl-3 text-right font-medium text-xs uppercase tracking-wide text-muted-foreground whitespace-nowrap">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.personas.map((p) => {
                      const susDias = new Set(p.dias);
                      const abierta = expandida === p.usuario;
                      return (
                        <React.Fragment key={p.usuario}>
                          <tr
                            className="cursor-pointer hover:bg-muted/40 transition-colors"
                            onClick={() => setExpandida(abierta ? null : p.usuario)}
                            aria-expanded={abierta}
                          >
                            <td className="sticky left-0 z-10 bg-card pr-3 py-1.5 border-b border-border/50">
                              <p className="font-medium text-foreground truncate max-w-[12rem]">
                                {p.nombre}
                                {p.archivado && (
                                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground align-middle">baja</span>
                                )}
                              </p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {p.area ? (labelArea(p.area) || p.area) : "Sin área"}
                                {p.dia_habitual ? ` · ${p.dia_habitual}` : ""}
                              </p>
                            </td>
                            {dias.map((d) => {
                              const asistio = susDias.has(d.iso);
                              const habil = habiles.has(d.iso);
                              return (
                                <td key={d.iso} className="px-0 py-1.5 text-center border-b border-border/50">
                                  <span
                                    title={asistio ? `${p.nombre} asistió el ${d.iso}` : habil ? `No asistió el ${d.iso} (día hábil)` : `${d.iso} (no hábil)`}
                                    className={`inline-block h-4 w-4 rounded-[4px] ${
                                      asistio ? "bg-primary" : habil ? "bg-muted-foreground/15" : "bg-transparent border border-border/40"
                                    }`}
                                  />
                                </td>
                              );
                            })}
                            <td className="pl-3 py-1.5 text-right font-semibold tabular-nums text-foreground border-b border-border/50">{p.total_dias}</td>
                            <td className={`pl-3 py-1.5 text-right tabular-nums border-b border-border/50 ${
                              p.cumplimiento === null ? "text-muted-foreground"
                              : p.cumplimiento >= 80 ? "text-green-600 font-semibold"
                              : p.cumplimiento >= 50 ? "text-amber-600 font-semibold"
                              : "text-red-600 font-semibold"
                            }`}>
                              {p.cumplimiento === null ? "—" : `${p.cumplimiento}%`}
                            </td>
                          </tr>
                          {abierta && (
                            <tr>
                              <td colSpan={dias.length + 3} className="bg-muted/20 px-3 py-3 border-b border-border/50">
                                {p.detalle.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">Sin fichajes en este periodo.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {p.detalle.map((d) => (
                                      <div key={d.fecha} className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs">
                                        <p className="font-semibold text-foreground tabular-nums">{d.fecha}</p>
                                        <p className="text-muted-foreground tabular-nums">{d.entrada || "—"} → {d.salida || "—"}</p>
                                        <p className="text-muted-foreground">
                                          {d.horas} h
                                          {d.manual && <span className="ml-1 text-amber-600">· manual</span>}
                                          {d.validado && <span className="ml-1 text-green-600">· validado</span>}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {p.fichajes_manuales > 0 && (
                                  <p className="text-[11px] text-amber-600 mt-2">
                                    {p.fichajes_manuales} fichaje(s) manuales: se registraron sin escanear QR y conviene revisarlos.
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-4 mt-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-primary" /> Asistió</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] bg-muted-foreground/15" /> Día hábil sin asistencia</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-[3px] border border-border" /> Día no hábil</span>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
