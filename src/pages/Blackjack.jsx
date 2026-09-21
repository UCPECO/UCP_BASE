import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Spade, Coins, Hand, Square, RefreshCw, AlertTriangle, Info, History,
  Timer, TrendingUp, TrendingDown, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionCard from "@/components/ucp/SectionCard";
import { useToast } from "@/components/ui/use-toast";
import blackjack, { fmtMinutos } from "@/api/blackjackClient";

// Los palos llegan del servidor como caracteres Unicode; el color va por palo,
// no por un color fijo, para que se lea bien en los tres temas de la app.
const ROJO = { "\u2665": true, "\u2666": true };

function Carta({ carta, oculta, pequena }) {
  if (oculta) {
    return (
      <div
        className={`${pequena ? "h-16 w-12" : "h-24 w-[4.5rem] sm:h-28 sm:w-20"} rounded-lg border border-border bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shadow-sm`}
        aria-label="Carta oculta"
      >
        <div className="h-3/4 w-3/4 rounded border border-primary/30 bg-background/40" />
      </div>
    );
  }
  if (!carta) return null;
  const rojo = ROJO[carta.p];
  return (
    <div
      className={`${pequena ? "h-16 w-12" : "h-24 w-[4.5rem] sm:h-28 sm:w-20"} rounded-lg border border-border bg-card shadow-sm flex flex-col items-center justify-center select-none`}
      aria-label={`Carta ${carta.r} de ${carta.p}`}
    >
      <span className={`${pequena ? "text-base" : "text-xl sm:text-2xl"} font-bold leading-none ${rojo ? "text-red-500" : "text-foreground"}`}>
        {carta.r}
      </span>
      <span className={`${pequena ? "text-sm" : "text-xl sm:text-2xl"} leading-none mt-0.5 ${rojo ? "text-red-500" : "text-foreground"}`}>
        {carta.p}
      </span>
    </div>
  );
}

const FICHAS = [
  { min: 30, label: "0.5 h" },
  { min: 60, label: "1 h" },
  { min: 120, label: "2 h" },
  { min: 300, label: "5 h" },
];

export default function Blackjack() {
  const [estado, setEstado] = useState(null);
  const [partida, setPartida] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [apuesta, setApuesta] = useState(60);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [verReglas, setVerReglas] = useState(false);
  const { toast } = useToast();

  const cargar = useCallback(async () => {
    setError("");
    try {
      const [e, h] = await Promise.all([
        blackjack.estado(),
        blackjack.misMovimientos(15).catch(() => ({ movimientos: [] })),
      ]);
      setEstado(e);
      setHistorial(h?.movimientos || []);
      setPartida(e?.partida || null);
    } catch (err) {
      setError(err?.message || "No se pudo cargar el blackjack");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Al montar, si había una partida en curso se reanuda (p. ej. tras refrescar
  // o volver desde otra pantalla): el estado vive en el servidor.
  const enJuego = partida && partida.estado === "activa";
  const terminada = partida && partida.estado === "terminada";

  const cfg = estado?.config;
  const saldo = estado?.saldo_disponible_min ?? 0;
  const restanteHoy = estado?.hoy?.restante_min ?? 0;
  const apuestaMaxima = useMemo(
    () => Math.max(0, Math.min(saldo, restanteHoy)),
    [saldo, restanteHoy]
  );
  // Doblar exige poder cubrir la apuesta extra con saldo Y con el límite diario
  // que quede. El servidor lo vuelve a validar; esto solo evita el clic inútil.
  const puedeDoblar = !!partida
    && !partida.doble
    && partida.mano?.length === 2
    && partida.apuesta_min <= Math.min(saldo, restanteHoy);

  // La apuesta se recorta al cambiar el saldo o el límite, nunca por encima
  useEffect(() => {
    setApuesta((a) => {
      const min = cfg?.apuesta_minima_min ?? 0;
      if (!Number.isFinite(a)) return min;
      return Math.min(Math.max(a, min), Math.max(min, apuestaMaxima));
    });
  }, [apuestaMaxima, cfg?.apuesta_minima_min]);

  const ejecutar = useCallback(async (fn, mensajeError) => {
    if (ocupado) return null;
    setOcupado(true);
    try {
      const r = await fn();
      setPartida(r?.partida ?? null);
      if (r?.partida?.estado === "terminada") {
        // Refrescar saldo, límite diario y mes tras resolver la mano
        const e = await blackjack.estado().catch(() => null);
        if (e) setEstado(e);
        const h = await blackjack.misMovimientos(15).catch(() => null);
        if (h) setHistorial(h.movimientos || []);
      }
      return r;
    } catch (err) {
      toast({ title: mensajeError, description: err?.message || "", variant: "destructive" });
      return null;
    } finally {
      setOcupado(false);
    }
  }, [ocupado, toast]);

  const repartir = () => ejecutar(
    () => blackjack.crearPartida(apuesta),
    "No se pudo repartir"
  );
  const pedir = () => ejecutar(
    () => blackjack.accion(partida.id, "pedir"),
    "No se pudo pedir carta"
  );
  const plantarse = () => ejecutar(
    () => blackjack.accion(partida.id, "plantarse"),
    "No se pudo plantar"
  );
  const doblar = () => ejecutar(
    () => blackjack.accion(partida.id, "doblar"),
    "No se pudo doblar"
  );
  const nuevaMano = () => setPartida(null);

  if (cargando) {
    return (
      <div className="space-y-4 pb-24 sm:pb-6" aria-busy="true">
        <div className="skeleton h-8 w-56 rounded-xl" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground flex items-center gap-2">
            <Spade className="h-6 w-6 text-primary" /> Blackjack de horas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Apuesta horas de tu servicio. Lo que ganes se difiere y se acredita como adicional del mes.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setVerReglas((v) => !v)}>
          <Info className="h-4 w-4 mr-1.5" /> {verReglas ? "Ocultar reglas" : "Reglas y pagos"}
        </Button>
      </div>

      {verReglas && (
        <SectionCard title="Cómo funciona" icon={Info}>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
            <li>Ganas <strong className="text-foreground">1:1</strong>, blackjack natural paga <strong className="text-foreground">3:2</strong>, empate devuelve tu apuesta.</li>
            <li>El dealer pide hasta 16 y se planta en 17 (también en 17 blando).</li>
            <li>Puedes <strong className="text-foreground">doblar</strong> con las dos primeras cartas: recibes exactamente una carta más y la apuesta se duplica.</li>
            <li>Apuesta mínima: <strong className="text-foreground">{fmtMinutos(cfg?.apuesta_minima_min)}</strong>. Límite por día: <strong className="text-foreground">{fmtMinutos(cfg?.limite_diario_min)}</strong>.</li>
            <li>
              <strong className="text-foreground">Las horas no se acreditan al instante.</strong> Cada mano queda registrada como movimiento
              pendiente del mes en curso{cfg?.liquidacion_diferida
                ? " y la administración liquida el mes cerrado: entonces se genera un único ajuste con tus ganancias o pérdidas netas."
                : " (en este momento la liquidación es inmediata)."}
            </li>
            <li>Las pérdidas pendientes <strong className="text-foreground">sí descuentan</strong> de tu saldo jugable, aunque todavía no se hayan aplicado a tus horas.</li>
            <li>Las cartas las reparte el servidor; el cliente no puede ver el mazo ni la carta oculta del dealer.</li>
          </ul>
        </SectionCard>
      )}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="underline font-medium shrink-0" onClick={cargar}>Reintentar</button>
        </div>
      )}

      {/* Marcadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Coins className="h-3.5 w-3.5" /> Saldo jugable</p>
          <p className="text-lg font-bold text-primary tabular-nums">{fmtMinutos(saldo)}</p>
          <p className="text-[11px] text-muted-foreground">{estado?.horas_validadas ?? 0} h validadas</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Timer className="h-3.5 w-3.5" /> Límite de hoy</p>
          <p className="text-lg font-bold text-foreground tabular-nums">{fmtMinutos(restanteHoy)}</p>
          <p className="text-[11px] text-muted-foreground">de {fmtMinutos(cfg?.limite_diario_min)} · apostado {fmtMinutos(estado?.hoy?.apostado_min)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-green-500" /> Ganado (pendiente)</p>
          <p className="text-lg font-bold text-green-600 tabular-nums">+{fmtMinutos(estado?.mes?.ganado_min)}</p>
          <p className="text-[11px] text-muted-foreground">{estado?.mes?.partidas ?? 0} mano(s) este mes</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-3">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><TrendingDown className="h-3.5 w-3.5 text-red-500" /> Perdido (pendiente)</p>
          <p className="text-lg font-bold text-red-600 tabular-nums">-{fmtMinutos(estado?.mes?.perdido_min)}</p>
          <p className="text-[11px] text-muted-foreground">neto {fmtMinutos(estado?.mes?.neto_min)} · {estado?.mes?.periodo}</p>
        </div>
      </div>

      {!estado?.activo ? (
        <SectionCard title="Blackjack no disponible" icon={Lock}>
          <div className="py-8 text-center">
            <Lock className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {estado?.motivo_inactivo || "El administrador no ha activado esta opción temporal."}
            </p>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="Mesa"
          subtitle={enJuego ? `Apuesta: ${fmtMinutos(partida.apuesta_min)}${partida.doble ? " (doblada)" : ""}` : "Elige tu apuesta y reparte"}
          icon={Spade}
        >
          {/* Dealer */}
          <div className="mb-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
              Dealer
              {partida && (
                <span className="normal-case tracking-normal text-foreground font-semibold tabular-nums">
                  {partida.dealer_valor?.total ?? 0}
                  {partida.dealer_oculta ? " + carta oculta" : ""}
                </span>
              )}
            </p>
            <div className="flex gap-2 flex-wrap min-h-[6rem]">
              {partida?.dealer?.map((c, i) => <Carta key={`d-${i}`} carta={c} />)}
              {!partida && <p className="text-sm text-muted-foreground self-center">Sin cartas repartidas</p>}
            </div>
          </div>

          {/* Resultado */}
          {terminada && (
            <div className={`mb-5 rounded-xl border p-3 text-center ${
              partida.delta_min > 0 ? "border-green-500/40 bg-green-500/10"
              : partida.delta_min < 0 ? "border-red-500/40 bg-red-500/10"
              : "border-border bg-muted/40"
            }`}>
              <p className="font-bold text-foreground capitalize">
                {partida.resultado === "blackjack" ? "¡Blackjack!" : partida.resultado}
                {" · "}
                <span className={partida.delta_min > 0 ? "text-green-600" : partida.delta_min < 0 ? "text-red-600" : "text-muted-foreground"}>
                  {partida.delta_min > 0 ? "+" : ""}{fmtMinutos(partida.delta_min)}
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {partida.delta_min === 0
                  ? "Empate: no se mueve ninguna hora."
                  : cfg?.liquidacion_diferida
                    ? "Queda diferido y se acreditará al liquidar el mes."
                    : "Aplicado a tus horas."}
              </p>
            </div>
          )}

          {/* Jugador */}
          <div className="mb-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
              Tu mano
              {partida && <span className="normal-case tracking-normal text-foreground font-semibold tabular-nums">{partida.mano_valor?.total ?? 0}{partida.mano_valor?.blanda ? " (blanda)" : ""}</span>}
            </p>
            <div className="flex gap-2 flex-wrap min-h-[6rem]">
              {partida?.mano?.map((c, i) => <Carta key={`p-${i}`} carta={c} />)}
              {!partida && <p className="text-sm text-muted-foreground self-center">Reparte para empezar</p>}
            </div>
          </div>

          {/* Controles */}
          {!partida ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {FICHAS.map((f) => (
                  <button
                    key={f.min}
                    type="button"
                    disabled={ocupado || f.min < (cfg?.apuesta_minima_min ?? 0) || f.min > apuestaMaxima}
                    onClick={() => setApuesta(f.min)}
                    className={`px-3 py-2 rounded-full border text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      apuesta === f.min ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Apuesta (minutos)</span>
                  <input
                    type="number"
                    min={cfg?.apuesta_minima_min ?? 1}
                    max={Math.max(cfg?.apuesta_minima_min ?? 1, apuestaMaxima)}
                    step={5}
                    value={apuesta}
                    onChange={(e) => setApuesta(Number(e.target.value))}
                    className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums"
                  />
                </label>
                <div className="text-xs text-muted-foreground pb-2">
                  = <strong className="text-foreground">{fmtMinutos(apuesta)}</strong>
                  {apuestaMaxima > 0 && <> · máx {fmtMinutos(apuestaMaxima)}</>}
                </div>
                <Button onClick={repartir} disabled={ocupado || !(apuesta >= (cfg?.apuesta_minima_min ?? 1)) || apuesta > apuestaMaxima || apuestaMaxima <= 0} className="mb-0.5">
                  <Hand className="h-4 w-4 mr-1.5" /> Repartir
                </Button>
              </div>
              {apuestaMaxima <= 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {saldo <= 0
                    ? "No tienes horas disponibles para apostar. Acumula horas fichando, o espera a que se liquide el mes."
                    : "Ya alcanzaste tu límite diario. Vuelve mañana."}
                </p>
              )}
            </div>
          ) : enJuego ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={pedir} disabled={ocupado || partida.doble}>
                <Spade className="h-4 w-4 mr-1.5" /> Pedir
              </Button>
              <Button variant="outline" onClick={plantarse} disabled={ocupado}>
                <Square className="h-4 w-4 mr-1.5" /> Plantarse
              </Button>
              <Button variant="outline" onClick={doblar} disabled={ocupado || !puedeDoblar}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Doblar ({fmtMinutos(partida.apuesta_min)})
              </Button>
              {!puedeDoblar && !partida.doble && partida.mano?.length === 2 && (
                <span className="self-center text-xs text-amber-600">Sin saldo suficiente para doblar</span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onClick={nuevaMano} disabled={ocupado}>
                <RefreshCw className="h-4 w-4 mr-1.5" /> Otra mano
              </Button>
              <Button variant="outline" onClick={cargar} disabled={ocupado}>
                Actualizar saldo
              </Button>
            </div>
          )}
        </SectionCard>
      )}

      {/* Historial */}
      <SectionCard title="Mis últimas manos" subtitle="Pendientes de liquidar y ya aplicadas" icon={History}>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Todavía no has jugado ninguna mano.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Mes</th>
                  <th className="py-2 pr-3 font-medium text-right">Apuesta</th>
                  <th className="py-2 pr-3 font-medium text-right">Resultado</th>
                  <th className="py-2 pr-3 font-medium text-right">Horas</th>
                  <th className="py-2 font-medium text-right">Estado</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((m) => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">{(m.created_date || "").slice(0, 16)}</td>
                    <td className="py-2 pr-3 text-muted-foreground tabular-nums">{m.periodo}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtMinutos(m.apuesta_min)}</td>
                    <td className="py-2 pr-3 text-right capitalize">{m.resultado}</td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${m.delta_min > 0 ? "text-green-600" : m.delta_min < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {m.delta_min > 0 ? "+" : ""}{fmtMinutos(m.delta_min)}
                    </td>
                    <td className="py-2 text-right">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                        m.estado === "aplicado" ? "bg-green-500/15 text-green-600"
                        : m.estado === "anulado" ? "bg-muted text-muted-foreground line-through"
                        : "bg-amber-500/15 text-amber-600"
                      }`}>{m.estado}</span>
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
