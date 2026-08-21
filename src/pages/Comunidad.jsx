import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageCircle, Users, Hash, Send, ArrowLeft, MessagesSquare,
  Pin, PinOff, Reply, Trash2, MicOff, Mic, X, Eye,
} from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import BotonPoke from "@/components/ucp/BotonPoke";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import { ROL_LABEL } from "@/lib/roles";

// Chat interno "Comunidad" v2: avisos fijados con confirmación de lectura,
// reacciones rápidas, respuestas con cita, menciones @nombre, estado en
// línea y moderación (borrar mensajes / silenciar usuarios).
function getToken() {
  return localStorage.getItem("ucp_token") || localStorage.getItem("token") || "";
}
async function api(path, options = {}) {
  const res = await fetch(`/api/mensajes${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const EMOJIS = ["👍", "❤️", "✅", "🎉", "😮"];

function Hora({ iso }) {
  const d = new Date((iso || "").replace(" ", "T") + "Z");
  const txt = isNaN(d) ? "" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return <span className="text-[10px] text-muted-foreground shrink-0">{txt}</span>;
}

function Avatar({ nombre, foto, size = "h-9 w-9", enLinea }) {
  const base = foto ? (
    <img src={foto} alt="" className={`${size} rounded-full object-cover shrink-0`} />
  ) : (
    <div className={`${size} rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0`}>
      {(nombre || "?").charAt(0)}
    </div>
  );
  if (enLinea === undefined) return base;
  return (
    <div className="relative shrink-0">
      {base}
      <span
        title={enLinea ? "En línea" : "Desconectado"}
        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${enLinea ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
      />
    </div>
  );
}

export default function Comunidad() {
  const { user } = useAuth();
  const [canales, setCanales] = useState([]);
  const [directorio, setDirectorio] = useState([]);
  const [canalActivo, setCanalActivo] = useState(null); // { canal, nombre, tipo }
  const [mensajes, setMensajes] = useState([]);
  const [fijados, setFijados] = useState([]);
  const [totalMiembros, setTotalMiembros] = useState(0);
  const [texto, setTexto] = useState("");
  const [citando, setCitando] = useState(null); // mensaje al que se responde
  const [accionMsgId, setAccionMsgId] = useState(null); // burbuja con barra de acciones abierta
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const finRef = useRef(null);
  const ultimoRef = useRef(null); // created_date del último mensaje cargado
  const vistosMarcadosRef = useRef(new Set()); // avisos ya confirmados en esta sesión

  const cargarCanales = useCallback(async () => {
    try {
      const [cs, dir] = await Promise.all([api("/canales"), api("/directorio")]);
      setCanales(cs);
      setDirectorio(dir);
      setError("");
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    cargarCanales();
    const t = setInterval(cargarCanales, 20000);
    return () => clearInterval(t);
  }, [cargarCanales]);

  // Cargar mensajes del canal activo; polling incremental cada 4 s.
  // El servidor devuelve { mensajes, fijados, total_miembros }.
  const cargarMensajes = useCallback(async (inicial = false) => {
    if (!canalActivo) return;
    try {
      const desde = !inicial && ultimoRef.current ? `?desde=${encodeURIComponent(ultimoRef.current)}` : "";
      const data = await api(`/canal/${encodeURIComponent(canalActivo.canal)}/mensajes${desde}`);
      const rows = data.mensajes || [];
      setFijados(data.fijados || []);
      setTotalMiembros(data.total_miembros || 0);
      if (inicial) {
        setMensajes(rows);
      } else if (rows.length > 0) {
        setMensajes((ms) => {
          const ids = new Set(ms.map((m) => m.id));
          return [...ms, ...rows.filter((r) => !ids.has(r.id))];
        });
      }
      if (rows.length > 0) ultimoRef.current = rows[rows.length - 1].created_date;
    } catch { /* polling silencioso */ }
  }, [canalActivo]);

  useEffect(() => {
    ultimoRef.current = null;
    setMensajes([]);
    setFijados([]);
    setCitando(null);
    setAccionMsgId(null);
    if (canalActivo) {
      cargarMensajes(true);
      const t = setInterval(() => cargarMensajes(false), 4000);
      return () => clearInterval(t);
    }
  }, [canalActivo, cargarMensajes]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length]);

  // ===== Aviso fijado: confirmar lectura al mostrarlo =====
  const aviso = fijados[0] || null;
  const avisoId = aviso?.id;
  const avisoYaVisto = aviso?.visto_por_mi;
  useEffect(() => {
    if (!avisoId || avisoYaVisto || vistosMarcadosRef.current.has(avisoId)) return;
    vistosMarcadosRef.current.add(avisoId);
    api(`/mensaje/${avisoId}/visto`, { method: "POST", body: "{}" })
      .then(() => {
        setFijados((fs) => fs.map((f) => f.id === avisoId ? { ...f, visto_por_mi: true, vistos: (f.vistos || 0) + 1 } : f));
      })
      .catch(() => {});
  }, [avisoId, avisoYaVisto]);

  const abrirDm = async (otroId) => {
    try {
      const { canal } = await api("/dm", { method: "POST", body: JSON.stringify({ usuario: otroId }) });
      const otro = directorio.find((u) => u.id === otroId);
      setCanalActivo({ canal, nombre: otro?.nombre || "Chat", tipo: "dm", foto: otro?.foto });
    } catch (e) { setError(e.message); }
  };

  const enviar = async (e) => {
    e?.preventDefault();
    const txt = texto.trim();
    if (!txt || enviando || !canalActivo) return;
    setEnviando(true);
    try {
      const msg = await api(`/canal/${encodeURIComponent(canalActivo.canal)}/mensajes`, {
        method: "POST",
        body: JSON.stringify({ texto: txt, cita_id: citando?.id || undefined }),
      });
      setMensajes((ms) => [...ms, msg]);
      ultimoRef.current = msg.created_date;
      setTexto("");
      setCitando(null);
    } catch (e2) {
      setError(e2.message);
    } finally {
      setEnviando(false);
    }
  };

  // ===== Reacciones (optimista; si falla, recarga) =====
  const reaccionar = async (m, emoji) => {
    setMensajes((ms) => ms.map((x) => {
      if (x.id !== m.id) return x;
      const r = { ...(x.reacciones || {}) };
      const g = { ...(r[emoji] || { n: 0, mia: false }) };
      if (g.mia) { g.mia = false; g.n = Math.max(0, g.n - 1); } else { g.mia = true; g.n += 1; }
      if (g.n === 0) delete r[emoji]; else r[emoji] = g;
      return { ...x, reacciones: r };
    }));
    try {
      await api(`/mensaje/${m.id}/reaccion`, { method: "POST", body: JSON.stringify({ emoji }) });
    } catch { cargarMensajes(true); }
  };

  const puedeFijar = !!canalActivo && canalActivo.tipo !== "dm" &&
    (user?.role === "admin" || (user?.role === "encargado" && canalActivo.tipo === "area"));

  const toggleFijar = async (m) => {
    try {
      await api(`/mensaje/${m.id}/fijar`, { method: "POST", body: JSON.stringify({ fijado: !m.fijado }) });
      setAccionMsgId(null);
      cargarMensajes(true);
    } catch (e) { setError(e.message); }
  };

  const borrar = async (m) => {
    if (!window.confirm("¿Borrar este mensaje?")) return;
    try {
      await api(`/mensaje/${m.id}`, { method: "DELETE" });
      setMensajes((ms) => ms.filter((x) => x.id !== m.id));
      setFijados((fs) => fs.filter((f) => f.id !== m.id));
      setAccionMsgId(null);
    } catch (e) { setError(e.message); }
  };

  const toggleSilencio = async (u) => {
    try {
      await api("/moderar/silenciar", { method: "POST", body: JSON.stringify({ usuario: u.id, silenciado: !u.silenciado }) });
      setDirectorio((ds) => ds.map((d) => d.id === u.id ? { ...d, silenciado: !u.silenciado } : d));
    } catch (e) { setError(e.message); }
  };

  // ===== Menciones @nombre =====
  const mencionMatch = texto.match(/(?:^|\s)@([\p{L}\p{N}._-]*)$/u);
  const sugerenciasMencion = mencionMatch
    ? directorio.filter((u) => u.id !== user?.id && u.nombre.toLowerCase().includes((mencionMatch[1] || "").toLowerCase())).slice(0, 5)
    : [];
  const insertarMencion = (u) => {
    setTexto((t) => t.replace(/@[\p{L}\p{N}._-]*$/u, `@${u.nombre} `));
  };

  const personasFiltradas = directorio.filter((u) =>
    u.id !== user?.id &&
    (!busqueda || u.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const IconCanal = ({ c }) => c.tipo === "general" ? <Hash className="h-4 w-4" /> : c.tipo === "area" ? <Users className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />;

  // Estado en línea del otro participante en un DM
  const otroDmId = canalActivo?.tipo === "dm" ? canalActivo.canal.split(":").slice(1).find((x) => x !== user?.id) : null;
  const otroDm = otroDmId ? directorio.find((u) => u.id === otroDmId) : null;

  // ===== Vista de chat =====
  const vistaChat = canalActivo && (
    <div className="flex flex-col h-[calc(100dvh-13rem)] sm:h-[calc(100dvh-14rem)] min-h-[320px]">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <button onClick={() => setCanalActivo(null)} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar nombre={canalActivo.nombre} foto={canalActivo.foto} enLinea={canalActivo.tipo === "dm" ? otroDm?.en_linea : undefined} />
        <div className="min-w-0">
          <p className="font-semibold truncate">{canalActivo.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {canalActivo.tipo === "general"
              ? "Canal de toda la comunidad"
              : canalActivo.tipo === "area"
                ? "Canal del área"
                : otroDm?.en_linea ? "🟢 En línea" : "Mensaje directo"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2.5 scrollbar-thin">
        {/* Banner de aviso fijado */}
        {aviso && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <div className="flex items-start gap-2">
              <Pin className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-amber-800 text-[11px] uppercase tracking-wide">
                  Aviso fijado · {aviso.usuario_nombre}
                </p>
                <p className="text-amber-900 whitespace-pre-wrap break-words">{aviso.texto}</p>
                <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1 flex-wrap">
                  <Eye className="h-3 w-3" />
                  Visto por {aviso.vistos || 0} de {totalMiembros}
                  {aviso.visto_por_mi && <span>· ✓ Tú ya lo viste</span>}
                </p>
              </div>
            </div>
          </div>
        )}

        {mensajes.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Aún no hay mensajes. ¡Saluda! 👋</p>
        )}
        {mensajes.map((m) => {
          const mio = m.usuario === user?.id;
          const conAcciones = accionMsgId === m.id;
          const reaccs = Object.entries(m.reacciones || {});
          return (
            <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] sm:max-w-[70%]`}>
                <div
                  onClick={() => setAccionMsgId(conAcciones ? null : m.id)}
                  className={`rounded-2xl px-3.5 py-2 cursor-pointer select-none ${mio ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}
                >
                  {!mio && canalActivo.tipo !== "dm" && (
                    <p className="text-[11px] font-semibold opacity-80 mb-0.5">
                      {m.usuario_nombre} {!!m.fijado && <span title="Aviso fijado">📌</span>}
                    </p>
                  )}
                  {mio && !!m.fijado && <p className="text-[11px] opacity-80 mb-0.5">📌 Aviso fijado</p>}
                  {m.cita_id && (
                    <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${mio ? "border-primary-foreground/50 bg-white/10" : "border-primary/50 bg-background/60"}`}>
                      <p className="font-semibold opacity-80">{m.cita_nombre}</p>
                      <p className="opacity-80 line-clamp-2 break-words">{m.cita_texto}</p>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                  <div className={`text-right mt-0.5 ${mio ? "opacity-70" : ""}`}><Hora iso={m.created_date} /></div>
                </div>

                {/* Reacciones acumuladas */}
                {reaccs.length > 0 && (
                  <div className={`flex flex-wrap gap-1 mt-1 ${mio ? "justify-end" : ""}`}>
                    {reaccs.map(([emoji, g]) => (
                      <button
                        key={emoji}
                        onClick={() => reaccionar(m, emoji)}
                        className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${g.mia ? "bg-primary/15 border-primary/40" : "bg-card border-border hover:bg-muted"}`}
                      >
                        {emoji} {g.n}
                      </button>
                    ))}
                  </div>
                )}

                {/* Barra de acciones (tocar la burbuja) */}
                {conAcciones && (
                  <div className={`flex flex-wrap items-center gap-1 mt-1 ${mio ? "justify-end" : ""}`}>
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        onClick={() => { reaccionar(m, e); setAccionMsgId(null); }}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-border bg-card hover:bg-muted text-base"
                      >
                        {e}
                      </button>
                    ))}
                    <button
                      onClick={() => { setCitando(m); setAccionMsgId(null); }}
                      title="Responder citando"
                      className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-card hover:bg-muted text-xs text-muted-foreground"
                    >
                      <Reply className="h-3.5 w-3.5" /> Responder
                    </button>
                    {puedeFijar && (
                      <button
                        onClick={() => toggleFijar(m)}
                        title={m.fijado ? "Desfijar aviso" : "Fijar como aviso"}
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-card hover:bg-muted text-xs text-muted-foreground"
                      >
                        {m.fijado ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        {m.fijado ? "Desfijar" : "Fijar"}
                      </button>
                    )}
                    {(user?.role === "admin" || mio) && (
                      <button
                        onClick={() => borrar(m)}
                        title="Borrar mensaje"
                        className="h-8 px-2.5 inline-flex items-center gap-1 rounded-full border border-border bg-card hover:bg-rose-50 text-xs text-rose-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Borrar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {/* Vista previa de la cita */}
      {citando && (
        <div className="flex items-center gap-2 mb-2 rounded-lg border border-border bg-muted/60 px-3 py-2">
          <Reply className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{citando.usuario_nombre}</p>
            <p className="text-xs text-muted-foreground truncate">{citando.texto}</p>
          </div>
          <button type="button" onClick={() => setCitando(null)} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <form onSubmit={enviar} className="relative flex gap-2 pt-3 border-t border-border">
        {/* Autocompletado de menciones */}
        {sugerenciasMencion.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-64 max-w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-10">
            <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Mencionar a…</p>
            {sugerenciasMencion.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => insertarMencion(u)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted text-left"
              >
                <Avatar nombre={u.nombre} foto={u.foto} size="h-6 w-6" enLinea={u.en_linea} />
                <span className="text-sm truncate">{u.nombre}</span>
              </button>
            ))}
          </div>
        )}
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje... (@ para mencionar)"
          maxLength={1000}
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" disabled={enviando || !texto.trim()} size="icon" title="Enviar">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );

  // ===== Vista de lista de canales =====
  const vistaCanales = (
    <div className="space-y-5">
      <div className="space-y-2">
        {canales.map((c) => (
          <button
            key={c.canal}
            onClick={() => setCanalActivo(c)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
              canalActivo?.canal === c.canal ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50"
            }`}
          >
            {c.tipo === "dm" ? (
              <Avatar nombre={c.nombre} foto={c.foto} />
            ) : (
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <IconCanal c={c} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{c.nombre}</p>
              <p className="text-xs text-muted-foreground truncate">
                {c.tipo === "dm"
                  ? (c.ultimo ? `${c.ultimo_propio ? "Tú: " : ""}${c.ultimo}` : "Conversación directa")
                  : c.descripcion}
              </p>
            </div>
          </button>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Miembros — escríbeles o dales un toque 👋</p>
        <Input placeholder="Buscar persona..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="mb-2" />
        <div className="space-y-1.5 max-h-72 overflow-y-auto scrollbar-thin pr-1">
          {personasFiltradas.map((u) => (
            <div key={u.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-muted/50">
              <Avatar nombre={u.nombre} foto={u.foto} size="h-8 w-8" enLinea={u.en_linea} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {u.nombre}{u.silenciado && <span title="Silenciado"> 🔇</span>}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {u.en_linea ? "En línea · " : ""}{ROL_LABEL[u.role] || u.role}{u.area ? ` · ${u.area}` : ""}
                </p>
              </div>
              {user?.role === "admin" && (
                <button
                  onClick={() => toggleSilencio(u)}
                  title={u.silenciado ? "Quitar silencio" : "Silenciar (no podrá escribir)"}
                  className={`h-9 w-9 inline-flex items-center justify-center rounded-lg border transition-colors ${u.silenciado ? "border-rose-200 bg-rose-50 text-rose-600" : "border-border hover:bg-muted text-muted-foreground"}`}
                >
                  {u.silenciado ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
              <BotonPoke usuarioId={u.id} nombre={u.nombre} size="icon" />
              <button onClick={() => abrirDm(u.id)} title="Enviar mensaje" className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
                <MessageCircle className="h-4 w-4" />
              </button>
            </div>
          ))}
          {personasFiltradas.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nadie coincide con la búsqueda.</p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <MessagesSquare className="h-7 w-7 text-primary" /> Comunidad
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Chat interno: avisos fijados 📌, reacciones, respuestas y menciones @nombre
        </p>
      </div>

      {error && <div className="p-3 rounded-lg bg-rose-100 text-rose-700 text-sm">{error}</div>}

      {/* Móvil: lista O chat. Escritorio: dos columnas */}
      <SectionCard className="md:hidden">{canalActivo ? vistaChat : vistaCanales}</SectionCard>
      <div className="hidden md:grid md:grid-cols-3 gap-6">
        <SectionCard title="Canales y miembros" className="md:col-span-1">{vistaCanales}</SectionCard>
        <SectionCard className="md:col-span-2">
          {canalActivo ? vistaChat : (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessagesSquare className="h-10 w-10 opacity-40" />
              <p className="text-sm">Elige un canal o una persona para chatear</p>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
