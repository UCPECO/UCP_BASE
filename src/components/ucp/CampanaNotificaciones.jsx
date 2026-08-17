import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCheck, Trash2, X } from "lucide-react";
import { formatearFecha } from "@/lib/ucpUtils";

// Campana de notificaciones internas. Hace polling cada 30 s.
// `alinear`: "derecha" (default, barra superior móvil) o "izquierda" (menú lateral,
// donde anclar a la derecha empuja el panel fuera de lugar).
export default function CampanaNotificaciones({ usuarioId, alinear = "derecha" }) {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  const cargar = async () => {
    if (!usuarioId) return;
    try {
      const data = await base44.entities.Notificaciones.filter({ usuario: usuarioId }, "-created_date", 15);
      setNotifs(data || []);
    } catch { /* polling silencioso */ }
  };

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, 30000);
    return () => clearInterval(t);
  }, [usuarioId]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const noLeidas = notifs.filter((n) => !n.leida);

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
