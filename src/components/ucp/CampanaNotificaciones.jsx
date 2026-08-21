import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bell, BellRing, CheckCheck, Trash2, X } from "lucide-react";
import { formatearFecha } from "@/lib/ucpUtils";
import { suscribirseAPush, pushDisponible } from "@/lib/push";

// ¿El navegador soporta notificaciones nativas?
const soportaNativas = typeof window !== "undefined" && "Notification" in window;

// Campana de notificaciones internas. Hace polling cada 30 s.
// Si el usuario activa los avisos nativos, las notificaciones NUEVAS no leídas
// también saltan como notificación del sistema (desktop y Android; en iPhone
// solo si la app está instalada como PWA desde Safari, iOS 16.4+).
// `alinear`: "derecha" (default, barra superior móvil) o "izquierda" (menú lateral,
// donde anclar a la derecha empuja el panel fuera de lugar).
export default function CampanaNotificaciones({ usuarioId, alinear = "derecha" }) {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [permiso, setPermiso] = useState(soportaNativas ? Notification.permission : "denied");
  const ref = useRef(null);
  const vistasRef = useRef(null); // ids ya vistos, para no repetir avisos nativos

  const avisarNativo = (nuevas) => {
    if (!soportaNativas || Notification.permission !== "granted") return;
    nuevas.slice(0, 3).forEach((n) => {
      const opciones = {
        body: n.mensaje || "",
        icon: "/branding/logo-mono.png",
        badge: "/branding/logo-mono.png",
        tag: `ucp-${n.id}`, // evita duplicados del mismo aviso
      };
      // Android Chrome no permite `new Notification()` desde la página:
      // hay que pasar por el service worker de la PWA.
      if (navigator.serviceWorker?.ready) {
        navigator.serviceWorker.ready
          .then((sw) => sw.showNotification(n.titulo || "UCP Horas", opciones))
          .catch(() => { try { new Notification(n.titulo || "UCP Horas", opciones); } catch {} });
      } else {
        try {
          const notif = new Notification(n.titulo || "UCP Horas", opciones);
          notif.onclick = () => { window.focus(); if (n.enlace) navigate(n.enlace); };
        } catch { /* sin soporte */ }
      }
    });
  };

  const cargar = async () => {
    if (!usuarioId) return;
    try {
      const data = await base44.entities.Notificaciones.filter({ usuario: usuarioId }, "-created_date", 15);
      const lista = data || [];
      // Aviso nativo solo para no leídas que no habíamos visto antes
      if (vistasRef.current === null) {
        vistasRef.current = new Set(lista.map((n) => n.id)); // primera carga: no avisar lo viejo
      } else {
        const nuevas = lista.filter((n) => !n.leida && !vistasRef.current.has(n.id));
        nuevas.forEach((n) => vistasRef.current.add(n.id));
        if (nuevas.length > 0) avisarNativo(nuevas);
      }
      setNotifs(lista);
    } catch { /* polling silencioso */ }
  };

  useEffect(() => {
    vistasRef.current = null;
    cargar();
    const t = setInterval(cargar, 15000);
    return () => clearInterval(t);
  }, [usuarioId]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const noLeidas = notifs.filter((n) => !n.leida);

  const pedirPermiso = async () => {
    if (!soportaNativas) return;
    try {
      const p = await Notification.requestPermission();
      setPermiso(p);
      if (p === "granted") {
        // Registrar el dispositivo para push: los avisos llegan aunque la app esté cerrada
        await suscribirseAPush();
        new Notification("UCP Horas", { body: "Avisos activados. Te llegarán aquí y aunque cierres la app.", icon: "/branding/logo-mono.png" });
      }
    } catch { /* navegador sin soporte de requestPermission asíncrono */ }
  };

  // Si el permiso ya estaba concedido de antes, re-suscribir en silencio
  // (idempotente: cubre tokens caducados o dispositivos reinstalados)
  useEffect(() => {
    if (usuarioId && pushDisponible() && Notification.permission === "granted") {
      suscribirseAPush();
    }
  }, [usuarioId]);

  const marcarLeida = async (n) => {
    try {
      if (!n.leida) await base44.entities.Notificaciones.update(n.id, { leida: 1 });
    } catch {}
    setAbierto(false);
    if (n.enlace) navigate(n.enlace);
    cargar();
  };

  const marcarTodas = async () => {
    try {
      await Promise.all(noLeidas.map((n) => base44.entities.Notificaciones.update(n.id, { leida: 1 })));
    } catch {}
    cargar();
  };

  const borrar = async (e, n) => {
    e.stopPropagation(); // no marcar como leída ni navegar
    setNotifs((ns) => ns.filter((x) => x.id !== n.id)); // quita al instante
    try { await base44.entities.Notificaciones.delete(n.id); } catch { cargar(); }
  };

  const borrarTodas = async () => {
    const ids = notifs.map((n) => n.id);
    setNotifs([]);
    try { await Promise.all(ids.map((id) => base44.entities.Notificaciones.delete(id))); } catch { cargar(); }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAbierto((o) => !o)}
        className="relative p-2 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-accent-foreground transition-colors"
        title="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {noLeidas.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {noLeidas.length > 9 ? "9+" : noLeidas.length}
          </span>
        )}
      </button>

      {abierto && (
        <div className={`absolute ${alinear === "izquierda" ? "left-0" : "right-0"} mt-2 w-80 max-w-[90vw] bg-card text-card-foreground rounded-2xl border border-border shadow-xl z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold">Notificaciones</p>
            <div className="flex items-center gap-3">
              {soportaNativas && permiso !== "granted" && permiso !== "denied" && (
                <button onClick={pedirPermiso} className="text-xs text-primary hover:underline flex items-center gap-1" title="Recibir avisos del sistema aunque no estés viendo la campana">
                  <BellRing className="h-3.5 w-3.5" /> Activar avisos
                </button>
              )}
              {noLeidas.length > 0 && (
                <button onClick={marcarTodas} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <CheckCheck className="h-3.5 w-3.5" /> Marcar leídas
                </button>
              )}
              {notifs.length > 0 && (
                <button onClick={borrarTodas} className="text-xs text-rose-600 hover:underline flex items-center gap-1" title="Borrar todas las notificaciones">
                  <Trash2 className="h-3.5 w-3.5" /> Borrar todas
                </button>
              )}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sin notificaciones</p>
            ) : (
              notifs.map((n) => (
                <button
                  key={n.id}
                  onClick={() => marcarLeida(n)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors ${n.leida ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${n.leida ? "bg-transparent" : "bg-primary"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{n.titulo}</p>
                      {n.mensaje && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.mensaje}</p>}
                      <p className="text-[10px] text-muted-foreground/70 mt-1">{formatearFecha(n.created_date)}</p>
                    </div>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => borrar(e, n)}
                      onKeyDown={(e) => { if (e.key === "Enter") borrar(e, n); }}
                      className="p-1 -m-1 rounded-lg text-muted-foreground/60 hover:text-rose-600 hover:bg-rose-50 shrink-0 transition-colors"
                      title="Borrar notificación"
                    >
                      <X className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
