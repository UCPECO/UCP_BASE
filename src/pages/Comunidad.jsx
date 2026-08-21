import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MessageCircle, Users, Hash, Send, ArrowLeft, MessagesSquare } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import BotonPoke from "@/components/ucp/BotonPoke";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import { ROL_LABEL } from "@/lib/roles";

// Chat interno "Comunidad": canal general, canal por área y mensajes
// directos. Polling cada 4 s en el canal abierto (ligero y suficiente
// para uso interno); los DM además disparan notificación push.
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

function Hora({ iso }) {
  const d = new Date((iso || "").replace(" ", "T") + "Z");
  const txt = isNaN(d) ? "" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  return <span className="text-[10px] text-muted-foreground shrink-0">{txt}</span>;
}

function Avatar({ nombre, foto, size = "h-9 w-9" }) {
  if (foto) return <img src={foto} alt="" className={`${size} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${size} rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0`}>
      {(nombre || "?").charAt(0)}
    </div>
  );
}

export default function Comunidad() {
  const { user } = useAuth();
  const [canales, setCanales] = useState([]);
  const [directorio, setDirectorio] = useState([]);
  const [canalActivo, setCanalActivo] = useState(null); // { canal, nombre, tipo }
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const finRef = useRef(null);
  const ultimoRef = useRef(null); // created_date del último mensaje cargado

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

  // Cargar mensajes del canal activo; polling incremental cada 4 s
  const cargarMensajes = useCallback(async (inicial = false) => {
    if (!canalActivo) return;
    try {
      const desde = !inicial && ultimoRef.current ? `?desde=${encodeURIComponent(ultimoRef.current)}` : "";
      const rows = await api(`/canal/${encodeURIComponent(canalActivo.canal)}/mensajes${desde}`);
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
    if (canalActivo) {
      cargarMensajes(true);
      const t = setInterval(() => cargarMensajes(false), 4000);
      return () => clearInterval(t);
    }
  }, [canalActivo, cargarMensajes]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensajes.length]);

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
      const msg = await api(`/canal/${encodeURIComponent(canalActivo.canal)}/mensajes`, { method: "POST", body: JSON.stringify({ texto: txt }) });
      setMensajes((ms) => [...ms, msg]);
      ultimoRef.current = msg.created_date;
      setTexto("");
    } catch (e2) {
      setError(e2.message);
    } finally {
      setEnviando(false);
    }
  };

  const personasFiltradas = directorio.filter((u) =>
    u.id !== user?.id &&
    (!busqueda || u.nombre.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const IconCanal = ({ c }) => c.tipo === "general" ? <Hash className="h-4 w-4" /> : c.tipo === "area" ? <Users className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />;

  // ===== Vista de chat =====
  const vistaChat = canalActivo && (
    <div className="flex flex-col h-[calc(100dvh-13rem)] sm:h-[calc(100dvh-14rem)] min-h-[320px]">
      <div className="flex items-center gap-3 pb-3 border-b border-border">
        <button onClick={() => setCanalActivo(null)} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted text-muted-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar nombre={canalActivo.nombre} foto={canalActivo.foto} />
        <div className="min-w-0">
          <p className="font-semibold truncate">{canalActivo.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {canalActivo.tipo === "general" ? "Canal de toda la comunidad" : canalActivo.tipo === "area" ? "Canal del área" : "Mensaje directo"}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-2.5 scrollbar-thin">
        {mensajes.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-10">Aún no hay mensajes. ¡Saluda! 👋</p>
        )}
        {mensajes.map((m) => {
          const mio = m.usuario === user?.id;
          return (
            <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 ${mio ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}>
                {!mio && canalActivo.tipo !== "dm" && (
                  <p className="text-[11px] font-semibold opacity-80 mb-0.5">{m.usuario_nombre}</p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{m.texto}</p>
                <div className={`text-right mt-0.5 ${mio ? "opacity-70" : ""}`}><Hora iso={m.created_date} /></div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      <form onSubmit={enviar} className="flex gap-2 pt-3 border-t border-border">
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un mensaje..."
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
              <Avatar nombre={u.nombre} foto={u.foto} size="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{u.nombre}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {ROL_LABEL[u.role] || u.role}{u.area ? ` · ${u.area}` : ""}
                </p>
              </div>
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
        <p className="text-sm text-muted-foreground mt-1">Chat interno: canal general, tu área y mensajes directos</p>
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
