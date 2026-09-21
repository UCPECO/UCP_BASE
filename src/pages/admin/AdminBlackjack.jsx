import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Spade, Save, Power, CalendarClock, Users, Ban, CheckCircle2,
  AlertTriangle, RefreshCw, History, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionCard from "@/components/ucp/SectionCard";
import KpiCard from "@/components/ucp/KpiCard";
import EmptyState from "@/components/ucp/EmptyState";
import { useToast } from "@/components/ui/use-toast";
import blackjack, { fmtMinutos } from "@/api/blackjackClient";

// El formulario trabaja en HORAS porque es lo natural para el administrador;
// la API y la base de datos trabajan en MINUTOS enteros para no arrastrar
// errores de punto flotante con las horas.
const aMin = (h) => Math.round(Number(h) * 60);
const aHor = (m) => Math.round(((Number(m) || 0) / 60) * 100) / 100;

const ETIQUETA_ESTADO = {
  pendiente: { txt: "Pendiente", cls: "bg-amber-500/15 text-amber-600" },
  aplicado: { txt: "Aplicado", cls: "bg-green-500/15 text-green-600" },
  anulado: { txt: "Anulado", cls: "bg-muted text-muted-foreground line-through" },
};

function periodoAnterior(referencia) {
  const [y, m] = String(referencia).split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminBlackjack() {
  const { toast } = useToast();
  const [resumen, setResumen] = useState(null);
  const [periodo, setPeriodo] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const [anulandoId, setAnulandoId] = useState(null);
  const [error, setError] = useState("");

  // Formulario de configuración (horas en pantalla, minutos al guardar)
  const [form, setForm] = useState({
    activo: false,
    apuesta_minima_h: 0.5,
    limite_diario_h: 2,
    mazos: 4,
    liquidacion_diferida: true,
    vigente_hasta: "",
  });

  const cargar = useCallback(async (per) => {
    setCargando(true);
    setError("");
    try {
      const r = await blackjack.resumen(per);
      setResumen(r);
      setPeriodo((p) => p || r.periodo);
      setForm({
        activo: !!r.config.activo,
        apuesta_minima_h: aHor(r.config.apuesta_minima_min),
        limite_diario_h: aHor(r.config.limite_diario_min),
        mazos: r.config.mazos,
        liquidacion_diferida: !!r.config.liquidacion_diferida,
        vigente_hasta: r.config.vigente_hasta || "",
      });
      const m = await blackjack.movimientos({ periodo: r.periodo, estado: filtroEstado, limit: 200 }).catch(() => ({ movimientos: [] }));
      setMovimientos(m.movimientos || []);
    } catch (e) {
      setError(e?.message || "No se pudo cargar la configuración del blackjack");
    } finally {
      setCargando(false);
    }
  }, [filtroEstado]);

  useEffect(() => { cargar(periodo); }, [cargar, periodo]);

  const guardar = async () => {
    if (aMin(form.apuesta_minima_h) > aMin(form.limite_diario_h)) {
      toast({ title: "La apuesta mínima no puede superar el límite diario", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const r = await blackjack.guardarConfig({
        activo: form.activo,
        apuesta_minima_min: aMin(form.apuesta_minima_h),
        limite_diario_min: aMin(form.limite_diario_h),
        mazos: form.mazos,
        liquidacion_diferida: form.liquidacion_diferida,
        vigente_hasta: form.vigente_hasta || null,
      });
      toast({
        title: r.config.activo ? "Blackjack activado" : "Blackjack desactivado",
        description: `Mínima ${fmtMinutos(r.config.apuesta_minima_min)} · límite diario ${fmtMinutos(r.config.limite_diario_min)}`,
      });
      await cargar(periodo);
    } catch (e) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const liquidar = async (per) => {
    setLiquidando(true);
    try {
      const r = await blackjack.liquidar(per);
      const total = (r.aplicados || []).reduce((a, x) => a + x.neto_min, 0);
      toast({
        title: `Mes ${per} liquidado`,
        description: `${(r.aplicados || []).length} persona(s) · neto ${fmtMinutos(total)} acreditado como adicional del mes`,
      });
      await cargar(periodo);
    } catch (e) {
      toast({ title: "No se pudo liquidar", description: e.message, variant: "destructive" });
    } finally {
      setLiquidando(false);
    }
  };

  const anular = async (m) => {
    setAnulandoId(m.id);
    try {
      await blackjack.anularMovimiento(m.id, "Anulado desde el panel de administración");
      toast({ title: "Movimiento anulado", description: m.ajuste_id ? "Se generó un ajuste compensatorio en sus horas." : "Estaba pendiente, no afectó sus horas." });
      await cargar(periodo);
    } catch (e) {
      toast({ title: "No se pudo anular", description: e.message, variant: "destructive" });
    } finally {
      setAnulandoId(null);
    }
  };

  const pendientes = resumen?.por_usuario || [];
  const netoPendiente = useMemo(() => pendientes.reduce((a, u) => a + (u.neto || 0), 0), [pendientes]);
  const totalGanado = useMemo(() => pendientes.reduce((a, u) => a + (u.ganado || 0), 0), [pendientes]);
  const totalPerdido = useMemo(() => pendientes.reduce((a, u) => a + Math.abs(u.perdido || 0), 0), [pendientes]);
  const mesCerrado = periodo && periodo < resumen?.periodo;

  if (cargando && !resumen) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="skeleton h-8 w-64 rounded-xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground flex items-center gap-2">
            <Spade className="h-6 w-6 text-primary" /> Blackjack
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Opción temporal: activa el juego, fija los límites y liquida las horas de cada mes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${resumen?.disponible?.ok ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground"}`}>
            {resumen?.disponible?.ok ? "Activo ahora" : "Inactivo"}
          </span>
          <Button variant="outline" size="sm" onClick={() => cargar(periodo)} disabled={cargando}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Actualizar
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="underline font-medium shrink-0" onClick={() => cargar(periodo)}>Reintentar</button>
        </div>
      )}

      {/* ===== Configuración ===== */}
      <SectionCard title="Configuración" subtitle="Los cambios aplican al guardar; las partidas en curso se pueden terminar aunque desactives el juego" icon={Power}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
              className="h-5 w-5 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Juego activo</span>
              <span className="block text-xs text-muted-foreground">Si está apagado, nadie puede apostar</span>
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Apuesta mínima (horas)</span>
            <input
              type="number" min="0.05" step="0.25" value={form.apuesta_minima_h}
              onChange={(e) => setForm({ ...form, apuesta_minima_h: Number(e.target.value) })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground">= {fmtMinutos(aMin(form.apuesta_minima_h))}</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Límite diario por persona (horas)</span>
            <input
              type="number" min="0.5" step="0.5" value={form.limite_diario_h}
              onChange={(e) => setForm({ ...form, limite_diario_h: Number(e.target.value) })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
            />
            <span className="text-[11px] text-muted-foreground">= {fmtMinutos(aMin(form.limite_diario_h))} apostados por día</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Vigente hasta (opcional)</span>
            <input
              type="date" value={form.vigente_hasta || ""}
              onChange={(e) => setForm({ ...form, vigente_hasta: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <span className="text-[11px] text-muted-foreground">Al pasar la fecha se apaga solo</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Mazos por partida</span>
            <select
              value={form.mazos}
              onChange={(e) => setForm({ ...form, mazos: Number(e.target.value) })}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n} mazo{n > 1 ? "s" : ""} ({n * 52} cartas)</option>)}
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.liquidacion_diferida}
              onChange={(e) => setForm({ ...form, liquidacion_diferida: e.target.checked })}
              className="h-5 w-5 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Liquidación diferida</span>
              <span className="block text-xs text-muted-foreground">
                {form.liquidacion_diferida ? "Se acredita al liquidar el mes" : "Se acredita en cada mano"}
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={guardar} disabled={guardando}>
            <Save className="h-4 w-4 mr-1.5" /> {guardando ? "Guardando…" : "Guardar configuración"}
          </Button>
          <p className="text-xs text-muted-foreground max-w-md">
            Cada cambio queda registrado en la bitácora de auditoría con quién lo hizo.
          </p>
        </div>
      </SectionCard>

      {/* ===== Mes ===== */}
      <SectionCard
        title="Mes a revisar"
        subtitle="Las horas diferidas se acreditan al liquidar un mes ya cerrado"
        icon={CalendarClock}
        action={
          <select
            value={periodo || ""}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            aria-label="Periodo a revisar"
          >
            {(resumen?.periodos?.length ? resumen.periodos : [periodo]).filter(Boolean).map((p) => (
              <option key={p} value={p}>{p}{p === resumen?.periodo ? " (en curso)" : ""}</option>
            ))}
          </select>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KpiCard icon={Users} label="Personas con movimientos" value={pendientes.length} />
          <KpiCard icon={TrendingUp} label="Ganado pendiente" value={fmtMinutos(totalGanado)} tone="primary" />
          <KpiCard icon={TrendingDown} label="Perdido pendiente" value={fmtMinutos(totalPerdido)} tone="accent" />
          <KpiCard icon={Wallet} label="Neto a acreditar" value={fmtMinutos(netoPendiente)} tone="blue" />
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            {mesCerrado ? (
              <>
                <p className="font-medium text-foreground">El mes {periodo} está cerrado.</p>
                <p className="text-xs text-muted-foreground">
                  Al liquidar se genera <strong>un único ajuste de horas por persona</strong> con su neto del mes,
                  como adicional, y se le notifica.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">El mes {periodo} sigue en curso.</p>
                <p className="text-xs text-muted-foreground">
                  Todavía pueden jugarse manos que lo modifiquen, así que no se puede liquidar aún.
                </p>
              </>
            )}
          </div>
          <Button onClick={() => liquidar(periodo)} disabled={liquidando || !mesCerrado || pendientes.length === 0}>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            {liquidando ? "Liquidando…" : `Liquidar ${fmtMinutos(netoPendiente)}`}
          </Button>
        </div>

        {pendientes.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Persona</th>
                  <th className="py-2 pr-3 font-medium text-right">Manos</th>
                  <th className="py-2 pr-3 font-medium text-right">Ganado</th>
                  <th className="py-2 pr-3 font-medium text-right">Perdido</th>
                  <th className="py-2 font-medium text-right">Neto</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((u) => (
                  <tr key={u.usuario} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-foreground">{u.usuario_nombre}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{u.partidas}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-green-600">+{fmtMinutos(u.ganado)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-red-600">-{fmtMinutos(Math.abs(u.perdido))}</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${u.neto > 0 ? "text-green-600" : u.neto < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {u.neto > 0 ? "+" : ""}{fmtMinutos(u.neto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ===== Movimientos ===== */}
      <SectionCard
        title="Movimientos"
        subtitle={`${movimientos.length} registro(s)${resumen?.totales ? ` · ${resumen.totales.partidas} partidas jugadas en total` : ""}`}
        icon={History}
        action={
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
            aria-label="Filtrar por estado"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendientes</option>
            <option value="aplicado">Aplicados</option>
            <option value="anulado">Anulados</option>
          </select>
        }
      >
        {movimientos.length === 0 ? (
          <EmptyState title="Sin movimientos" message="No hay manos registradas para este filtro." icon={History} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Persona</th>
                  <th className="py-2 pr-3 font-medium">Mes</th>
                  <th className="py-2 pr-3 font-medium">Resultado</th>
                  <th className="py-2 pr-3 font-medium text-right">Apuesta</th>
                  <th className="py-2 pr-3 font-medium text-right">Horas</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{(m.created_date || "").slice(0, 16)}</td>
                    <td className="py-2 pr-3 text-foreground">{m.usuario_nombre}</td>
                    <td className="py-2 pr-3 text-muted-foreground tabular-nums">{m.periodo}</td>
                    <td className="py-2 pr-3 capitalize text-muted-foreground">{m.resultado}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{fmtMinutos(m.apuesta_min)}</td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${m.delta_min > 0 ? "text-green-600" : m.delta_min < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {m.delta_min > 0 ? "+" : ""}{fmtMinutos(m.delta_min)}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${ETIQUETA_ESTADO[m.estado]?.cls || "bg-muted text-muted-foreground"}`}>
                        {ETIQUETA_ESTADO[m.estado]?.txt || m.estado}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {m.estado !== "anulado" && (
                        <Button variant="outline" size="sm" onClick={() => anular(m)} disabled={anulandoId === m.id}>
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          {anulandoId === m.id ? "…" : "Anular"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
