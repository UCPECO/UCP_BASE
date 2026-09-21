import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Play, Pause, RotateCw, ChevronLeft, ChevronRight, ArrowDownToLine,
  Trophy, Gamepad2, Medal, Timer, Layers, Zap, Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import SectionCard from "@/components/ucp/SectionCard";
import { useToast } from "@/components/ui/use-toast";
import tetris from "@/api/tetrisClient";
import {
  COLUMNAS, FILAS, COLOR_PIEZA, crearTablero, nuevaBolsa, posicionInicial,
  colisiona, intentarRotar, intentarMover, filaDeAterrizaje, fijarPieza,
  limpiarLineas, puntosPorLineas, nivelPorLineas, velocidadPorNivel, celdasDe,
  formatearDuracion, matrizDe,
} from "@/lib/tetris";

// ===== Estado de la partida =====
// Todo el juego vive en un solo objeto y se actualiza con useReducer: el bucle
// y los teclados despachan acciones en vez de leer estado desde un closure, que
// es exactamente el patrón que causaba los cierres obsoletos (stale closures)
// detectados en la revisión.

function sacarPieza(estado) {
  // Copias: nunca mutar los arrays del estado anterior (React no lo detectaría
  // y el re-render mostraría datos inconsistentes).
  const bolsa = [...(estado.bolsa || [])];
  const cola = [...(estado.cola || [])];
  // Repostar hasta tener de sobra: se reparte la bolsa actual y, al agotarse,
  // una bolsa nueva de 7 (generador estándar de Tetris).
  while (cola.length < 5) {
    if (bolsa.length === 0) bolsa.push(...nuevaBolsa());
    cola.push(bolsa.shift());
  }
  const tipo = cola.shift();
  return { tipo, cola, bolsa };
}

function estadoInicial() {
  const { tipo, cola, bolsa } = sacarPieza({ cola: [], bolsa: nuevaBolsa() });
  return {
    fase: "idle", // idle | jugando | pausa | fin
    tablero: crearTablero(),
    pieza: null,
    cola,
    bolsa,
    guardada: null,
    puedeGuardar: true,
    puntos: 0,
    lineas: 0,
    nivel: 1,
    piezas: 0,
    primerTipo: tipo,
  };
}

function empezar(estado) {
  const base = estadoInicial();
  const tipo = base.primerTipo;
  return {
    ...base,
    primerTipo: undefined,
    fase: "jugando",
    pieza: { tipo, ...posicionInicial(tipo) },
  };
}

// Coloca la pieza activa, limpia líneas y saca la siguiente.
function fijarYContinuar(estado, puntosExtra = 0) {
  const { tablero: grabado, bloqueado } = fijarPieza(estado.tablero, estado.pieza);
  if (bloqueado) return { ...estado, fase: "fin", tablero: grabado, pieza: null };

  const { tablero: limpio, lineas } = limpiarLineas(grabado);
  const ganados = puntosPorLineas(lineas, estado.nivel);
  const nuevasLineas = estado.lineas + lineas;

  const { tipo, cola, bolsa } = sacarPieza(estado);
  const siguiente = { tipo, ...posicionInicial(tipo) };

  // Si la pieza nueva no cabe al aparecer, se acabó la partida
  if (colisiona(limpio, siguiente.tipo, siguiente.x, siguiente.y, siguiente.rot)) {
    return { ...estado, fase: "fin", tablero: limpio, pieza: null, puntos: estado.puntos + ganados + puntosExtra, lineas: nuevasLineas, piezas: estado.piezas + 1 };
  }

  return {
    ...estado,
    tablero: limpio,
    pieza: siguiente,
    cola,
    bolsa,
    guardada: estado.guardada,
    puedeGuardar: true,
    puntos: estado.puntos + ganados + puntosExtra,
    lineas: nuevasLineas,
    nivel: nivelPorLineas(nuevasLineas),
    piezas: estado.piezas + 1,
  };
}

function reductor(estado, accion) {
  if (accion.type === "INICIAR") return empezar(estado);
  if (accion.type === "PAUSA") {
    if (estado.fase === "jugando") return { ...estado, fase: "pausa" };
    if (estado.fase === "pausa") return { ...estado, fase: "jugando" };
    return estado;
  }
  if (estado.fase !== "jugando" || !estado.pieza) return estado;

  switch (accion.type) {
    case "TICK": {
      const movido = intentarMover(estado.tablero, estado.pieza, 0, 1);
      if (movido) return { ...estado, pieza: movido };
      return fijarYContinuar(estado);
    }
    case "IZQUIERDA":
    case "DERECHA": {
      const dx = accion.type === "IZQUIERDA" ? -1 : 1;
      const movido = intentarMover(estado.tablero, estado.pieza, dx, 0);
      return movido ? { ...estado, pieza: movido } : estado;
    }
    case "ROTAR": {
      const rotada = intentarRotar(estado.tablero, estado.pieza, accion.sentido || 1);
      return rotada ? { ...estado, pieza: rotada } : estado;
    }
    case "SUAVE": {
      const movido = intentarMover(estado.tablero, estado.pieza, 0, 1);
      if (!movido) return fijarYContinuar(estado, 1);
      return { ...estado, pieza: movido, puntos: estado.puntos + 1 };
    }
    case "DURA": {
      const destino = filaDeAterrizaje(estado.tablero, estado.pieza);
      const celdas = Math.max(0, destino - estado.pieza.y);
      if (celdas === 0) return fijarYContinuar(estado);
      return fijarYContinuar({ ...estado, pieza: { ...estado.pieza, y: destino } }, celdas * 2);
    }
    case "GUARDAR": {
      if (!estado.puedeGuardar) return estado;
      const actual = estado.pieza.tipo;
      if (estado.guardada) {
        const tipo = estado.guardada;
        const nueva = { tipo, ...posicionInicial(tipo) };
        if (colisiona(estado.tablero, nueva.tipo, nueva.x, nueva.y, nueva.rot)) return estado;
        return { ...estado, pieza: nueva, guardada: actual, puedeGuardar: false };
      }
      const { tipo, cola, bolsa } = sacarPieza(estado);
      const siguiente = { tipo, ...posicionInicial(tipo) };
      if (colisiona(estado.tablero, siguiente.tipo, siguiente.x, siguiente.y, siguiente.rot)) {
        return { ...estado, fase: "fin", guardada: actual, puedeGuardar: false };
      }
      return { ...estado, pieza: siguiente, cola, bolsa, guardada: actual, puedeGuardar: false };
    }
    default:
      return estado;
  }
}

// ===== Miniatura de una pieza (cola y reserva) =====
function MiniPieza({ tipo, vacio }) {
  if (!tipo) {
    return <div className="h-12 w-12 rounded-lg border border-dashed border-border/70" aria-hidden />;
  }
  const m = matrizDe(tipo, 0);
  // Recortar filas/columnas vacías para que la miniatura quede centrada
  const filas = m.filter((f) => f.some((c) => c));
  const minCol = Math.min(...filas.map((f) => f.findIndex((c) => c)));
  const maxCol = Math.max(...filas.map((f) => f.reduce((acc, c, i) => (c ? i : acc), -1)));
  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${maxCol - minCol + 1}, 1fr)` }}
      aria-label={`Pieza ${tipo}`}
    >
      {filas.map((fila, y) =>
        fila.slice(minCol, maxCol + 1).map((c, x) => (
          <div
            key={`${y}-${x}`}
            className={`h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[3px] ${c ? COLOR_PIEZA[tipo] : "bg-transparent"}`}
          />
        ))
      )}
    </div>
  );
}

export default function Tetris() {
  const [estado, dispatch] = useReducer(reductor, undefined, estadoInicial);
  const [ranking, setRanking] = useState(null);
  const [cargandoRanking, setCargandoRanking] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const inicioRef = useRef(null);
  const enviadoRef = useRef(false);   // evita mandar la misma partida dos veces
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const cargarRanking = useCallback(async () => {
    setCargandoRanking(true);
    setError("");
    try {
      const data = await tetris.ranking(20);
      if (montadoRef.current) setRanking(data);
    } catch (e) {
      // Error visible y reintentable: no dejar la pantalla vacía sin explicar nada
      if (montadoRef.current) setError(e?.message || "No se pudo cargar el ranking");
    } finally {
      if (montadoRef.current) setCargandoRanking(false);
    }
  }, []);

  useEffect(() => { cargarRanking(); }, [cargarRanking]);

  // ===== Cronómetro de la partida =====
  useEffect(() => {
    if (estado.fase === "jugando") {
      if (inicioRef.current === null) inicioRef.current = Date.now();
      const t = setInterval(() => {
        if (inicioRef.current !== null && montadoRef.current) {
          setSegundos(Math.floor((Date.now() - inicioRef.current) / 1000));
        }
      }, 1000);
      return () => clearInterval(t);
    }
    if (estado.fase === "idle") {
      inicioRef.current = null;
      setSegundos(0);
    }
    return undefined;
  }, [estado.fase]);

  // ===== Bucle de caída: se recrea cuando cambia el nivel (y por tanto la velocidad) =====
  useEffect(() => {
    if (estado.fase !== "jugando") return undefined;
    const ms = velocidadPorNivel(estado.nivel);
    const t = setInterval(() => dispatch({ type: "TICK" }), ms);
    return () => clearInterval(t);
  }, [estado.fase, estado.nivel]);

  // ===== Al terminar: enviar el puntaje al ranking global =====
  useEffect(() => {
    if (estado.fase !== "fin" || enviadoRef.current) return;
    enviadoRef.current = true;
    const duracion = inicioRef.current ? Math.floor((Date.now() - inicioRef.current) / 1000) : segundos;

    (async () => {
      setEnviando(true);
      try {
        const r = await tetris.enviar({
          puntos: estado.puntos,
          lineas: estado.lineas,
          nivel: estado.nivel,
          piezas: estado.piezas,
          duracion_seg: duracion,
        });
        if (!montadoRef.current) return;
        if (r?.es_record_personal) {
          toast({ title: "¡Nuevo récord personal!", description: `${estado.puntos.toLocaleString("es-MX")} puntos · puesto #${r.posicion_global} del ranking global` });
        } else if (r?.posicion_global) {
          toast({ title: "Partida registrada", description: `Puesto #${r.posicion_global} del ranking global` });
        }
        await cargarRanking();
      } catch (e) {
        if (montadoRef.current) {
          toast({ title: "No se pudo guardar el puntaje", description: e?.message || "Revisa tu conexión", variant: "destructive" });
          enviadoRef.current = false; // permitir reintentar al volver a terminar
        }
      } finally {
        if (montadoRef.current) setEnviando(false);
      }
    })();
  }, [estado.fase, estado.puntos, estado.lineas, estado.nivel, estado.piezas, segundos, toast, cargarRanking]);

  // ===== Teclado =====
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key;
      const jugando = estado.fase === "jugando";
      if (k === "p" || k === "P" || k === "Escape") {
        e.preventDefault();
        if (estado.fase === "jugando" || estado.fase === "pausa") dispatch({ type: "PAUSA" });
        return;
      }
      if (!jugando) return;
      // Sin repetir para acciones de un solo disparo: con la repetición del
      // teclado una tecla mantenida rotaba o tiraba la pieza docenas de veces.
      if (e.repeat && (k === " " || k === "ArrowUp" || k === "c" || k === "C" || k === "z" || k === "Z")) return;

      switch (k) {
        case "ArrowLeft":  e.preventDefault(); dispatch({ type: "IZQUIERDA" }); break;
        case "ArrowRight": e.preventDefault(); dispatch({ type: "DERECHA" }); break;
        case "ArrowDown":  e.preventDefault(); dispatch({ type: "SUAVE" }); break;
        case "ArrowUp":    e.preventDefault(); dispatch({ type: "ROTAR", sentido: 1 }); break;
        case "z": case "Z": dispatch({ type: "ROTAR", sentido: -1 }); break;
        case "x": case "X": dispatch({ type: "ROTAR", sentido: 1 }); break;
        case " ":          e.preventDefault(); dispatch({ type: "DURA" }); break;
        case "c": case "C": case "Shift": dispatch({ type: "GUARDAR" }); break;
        default: break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [estado.fase]);

  // ===== Tablero a pintar: celdas fijas + sombra + pieza activa =====
  const celdas = useMemo(() => {
    const mapa = estado.tablero.map((fila) => fila.map((c) => ({ tipo: c, sombra: false })));
    if (estado.pieza && (estado.fase === "jugando" || estado.fase === "pausa")) {
      const destino = filaDeAterrizaje(estado.tablero, estado.pieza);
      if (destino !== estado.pieza.y) {
        for (const { x, y } of celdasDe(estado.pieza, destino - estado.pieza.y)) {
          if (!mapa[y][x].tipo) mapa[y][x] = { tipo: estado.pieza.tipo, sombra: true };
        }
      }
      for (const { x, y } of celdasDe(estado.pieza)) mapa[y][x] = { tipo: estado.pieza.tipo, sombra: false };
    }
    return mapa;
  }, [estado.tablero, estado.pieza, estado.fase]);

  const iniciar = () => {
    enviadoRef.current = false;
    setSegundos(0);
    inicioRef.current = null;
    dispatch({ type: "INICIAR" });
  };

  const enJuego = estado.fase === "jugando";
  const boton = "h-12 w-12 sm:h-14 sm:w-14 rounded-xl border border-border bg-card text-foreground active:scale-95 transition-transform flex items-center justify-center touch-manipulation select-none";

  return (
    <div className="space-y-4 pb-24 sm:pb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold font-heading text-foreground flex items-center gap-2">
            <Gamepad2 className="h-6 w-6 text-primary" /> Tetris UCP
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Juega y compite por el mejor puntaje global de la comunidad.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={cargarRanking} disabled={cargandoRanking}>
          <Trophy className="h-4 w-4 mr-1.5" /> {cargandoRanking ? "Actualizando…" : "Actualizar ranking"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[auto_1fr] items-start">
        {/* ===== Tablero ===== */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-3 items-start">
            {/* Marcadores */}
            <div className="flex flex-col gap-2 w-24 sm:w-28">
              <div className="bg-card rounded-xl border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Puntos</p>
                <p className="text-base sm:text-lg font-bold text-primary tabular-nums">{estado.puntos.toLocaleString("es-MX")}</p>
              </div>
              <div className="bg-card rounded-xl border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nivel</p>
                <p className="text-base sm:text-lg font-bold text-foreground tabular-nums flex items-center justify-center gap-1">
                  <Zap className="h-3.5 w-3.5 text-primary" />{estado.nivel}
                </p>
              </div>
              <div className="bg-card rounded-xl border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Líneas</p>
                <p className="text-base sm:text-lg font-bold text-foreground tabular-nums flex items-center justify-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-primary" />{estado.lineas}
                </p>
              </div>
              <div className="bg-card rounded-xl border border-border p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Tiempo</p>
                <p className="text-sm font-semibold text-foreground tabular-nums flex items-center justify-center gap-1">
                  <Timer className="h-3.5 w-3.5 text-muted-foreground" />{formatearDuracion(segundos)}
                </p>
              </div>
            </div>

            {/* Rejilla de juego */}
            <div className="relative">
              <div
                className="grid gap-px bg-border/40 border border-border rounded-lg overflow-hidden p-px"
                style={{
                  gridTemplateColumns: `repeat(${COLUMNAS}, minmax(0, 1fr))`,
                  width: "min(78vw, 300px)",
                  aspectRatio: `${COLUMNAS} / ${FILAS}`,
                }}
                role="img"
                aria-label={`Tablero de Tetris, ${estado.lineas} líneas, nivel ${estado.nivel}`}
              >
                {celdas.flatMap((fila, y) =>
                  fila.map((c, x) => (
                    <div
                      key={`${x}-${y}`}
                      className={
                        c.tipo
                          ? c.sombra
                            ? `${COLOR_PIEZA[c.tipo]} opacity-20`
                            : `${COLOR_PIEZA[c.tipo]} shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]`
                          : "bg-background"
                      }
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  ))
                )}
              </div>

              {/* Overlays de estado */}
              {estado.fase !== "jugando" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 backdrop-blur-sm rounded-lg px-4 text-center">
                  {estado.fase === "idle" && (
                    <>
                      <Gamepad2 className="h-10 w-10 text-primary" />
                      <p className="font-semibold text-foreground">¿Listo para jugar?</p>
                      <p className="text-xs text-muted-foreground">Tu puntaje se sumará al ranking global de UCP.</p>
                    </>
                  )}
                  {estado.fase === "pausa" && (
                    <>
                      <Pause className="h-10 w-10 text-primary" />
                      <p className="font-semibold text-foreground">Pausa</p>
                    </>
                  )}
                  {estado.fase === "fin" && (
                    <>
                      <Trophy className="h-10 w-10 text-primary" />
                      <p className="font-semibold text-foreground">Fin de la partida</p>
                      <p className="text-2xl font-bold text-primary tabular-nums">{estado.puntos.toLocaleString("es-MX")}</p>
                      <p className="text-xs text-muted-foreground">
                        {estado.lineas} líneas · nivel {estado.nivel} · {estado.piezas} piezas · {formatearDuracion(segundos)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {enviando ? "Guardando tu puntaje…" : "Puntaje guardado en el ranking global"}
                      </p>
                    </>
                  )}
                  {(estado.fase === "idle" || estado.fase === "fin") && (
                    <Button onClick={iniciar} className="mt-1">
                      <Play className="h-4 w-4 mr-1.5" /> {estado.fase === "fin" ? "Jugar otra vez" : "Empezar"}
                    </Button>
                  )}
                  {estado.fase === "pausa" && (
                    <Button onClick={() => dispatch({ type: "PAUSA" })} className="mt-1">
                      <Play className="h-4 w-4 mr-1.5" /> Reanudar
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Reserva y siguientes */}
            <div className="flex flex-col gap-2 w-20 sm:w-24">
              <div className="bg-card rounded-xl border border-border p-2.5 flex flex-col items-center gap-1">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Reserva</p>
                <MiniPieza tipo={estado.guardada} />
              </div>
              <div className="bg-card rounded-xl border border-border p-2.5 flex flex-col items-center gap-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Siguen</p>
                {estado.cola.slice(0, 3).map((t, i) => (
                  <MiniPieza key={`${t}-${i}`} tipo={t} />
                ))}
              </div>
            </div>
          </div>

          {/* Controles táctiles (la app es una PWA de uso principal en móvil) */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className={boton} aria-label="Mover a la izquierda"
              onPointerDown={() => enJuego && dispatch({ type: "IZQUIERDA" })}>
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" className={boton} aria-label="Rotar a la izquierda"
              onPointerDown={() => enJuego && dispatch({ type: "ROTAR", sentido: -1 })}>
              <RotateCw className="h-5 w-5 -scale-x-100" />
            </button>
            <button type="button" className={boton} aria-label="Bajar despacio"
              onPointerDown={() => enJuego && dispatch({ type: "SUAVE" })}>
              <ChevronRight className="h-5 w-5 rotate-90" />
            </button>
            <button type="button" className={boton} aria-label="Rotar a la derecha"
              onPointerDown={() => enJuego && dispatch({ type: "ROTAR", sentido: 1 })}>
              <RotateCw className="h-5 w-5" />
            </button>
            <button type="button" className={boton} aria-label="Mover a la derecha"
              onPointerDown={() => enJuego && dispatch({ type: "DERECHA" })}>
              <ChevronRight className="h-5 w-5" />
            </button>
            <button type="button" className={boton} aria-label="Caída dura"
              onPointerDown={() => enJuego && dispatch({ type: "DURA" })}>
              <ArrowDownToLine className="h-5 w-5 text-primary" />
            </button>
            <button type="button" className={boton} aria-label={enJuego ? "Pausar" : "Reanudar"}
              onPointerDown={() => (estado.fase === "jugando" || estado.fase === "pausa") && dispatch({ type: "PAUSA" })}>
              {enJuego ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center max-w-md">
            Teclado: ← → mover · ↑ o X rotar · Z rotar al revés · ↓ bajar · Espacio caída dura · C reservar · P pausa
          </p>
        </div>

        {/* ===== Ranking global ===== */}
        <SectionCard
          title="Ranking global"
          subtitle={
            ranking
              ? `${ranking.total_jugadores} jugador${ranking.total_jugadores === 1 ? "" : "es"} · ${ranking.total_partidas} partida${ranking.total_partidas === 1 ? "" : "s"}`
              : "Mejor puntaje de cada participante"
          }
          icon={Trophy}
        >
          {ranking?.mio && (
            <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tu récord</p>
                <p className="text-lg font-bold text-primary tabular-nums">{ranking.mio.puntos.toLocaleString("es-MX")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ranking.mio.lineas} líneas · nivel {ranking.mio.nivel}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Posición</p>
                <p className="text-2xl font-bold text-foreground tabular-nums flex items-center justify-end gap-1">
                  <Crown className="h-4 w-4 text-primary" />#{ranking.mio.posicion}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
              <button type="button" className="underline ml-2 font-medium" onClick={cargarRanking}>Reintentar</button>
            </div>
          )}

          {cargandoRanking && !ranking ? (
            <div className="space-y-2" aria-busy="true" aria-label="Cargando ranking">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-11 rounded-xl" />
              ))}
            </div>
          ) : !ranking?.ranking?.length ? (
            <div className="py-10 text-center">
              <Medal className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">Todavía nadie ha jugado. ¡Sé el primero en el ranking!</p>
            </div>
          ) : (
            <ol className="space-y-1.5">
              {ranking.ranking.map((r) => (
                <li
                  key={r.usuario}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                    r.soy_yo ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card"
                  }`}
                >
                  <span
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                      r.posicion === 1 ? "bg-yellow-400 text-yellow-950"
                      : r.posicion === 2 ? "bg-slate-300 text-slate-800"
                      : r.posicion === 3 ? "bg-orange-400 text-orange-950"
                      : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.posicion}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {r.nombre} {r.soy_yo && <span className="text-[10px] text-primary font-semibold">(tú)</span>}
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {r.lineas} líneas · nivel {r.nivel}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold text-foreground tabular-nums">{r.puntos.toLocaleString("es-MX")}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
