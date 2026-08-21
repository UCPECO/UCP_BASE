import React, { useEffect } from "react";

// Celebración a pantalla completa al fichar: check que se dibuja dentro de un
// círculo, anillos de luz que se expanden y vibración háptica en el teléfono.
// Se cierra sola a los ~2.4 s o con un toque.
export default function CelebracionFichaje({ tipo = "entrada", hora, horas, onClose }) {
  useEffect(() => {
    try { navigator.vibrate?.(tipo === "salida" ? [40, 60, 40] : 60); } catch {}
    const t = setTimeout(onClose, 2400);
    return () => clearTimeout(t);
  }, [onClose, tipo]);

  const esSalida = tipo === "salida";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm cursor-pointer"
      onClick={onClose}
      role="status"
      aria-live="polite"
    >
      <div className="relative flex flex-col items-center text-center px-6">
        {/* Anillos de luz que se expanden */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="absolute -inset-10 rounded-full border-2 border-accent/60 animate-pulse-ring" />
          <div className="absolute -inset-10 rounded-full border-2 border-primary/60 animate-pulse-ring-delay" />
        </div>

        {/* Check dibujado con trazo animado */}
        <div className="animate-pop-in relative">
          <svg width="132" height="132" viewBox="0 0 132 132" fill="none">
            <defs>
              <linearGradient id="celebracion-aurora" x1="0" y1="0" x2="132" y2="132">
                <stop offset="0%" stopColor="hsl(var(--accent))" />
                <stop offset="100%" stopColor="hsl(var(--primary))" />
              </linearGradient>
            </defs>
            <circle
              cx="66" cy="66" r="58"
              stroke="url(#celebracion-aurora)" strokeWidth="7" strokeLinecap="round"
              pathLength="100" strokeDasharray="100" strokeDashoffset="100"
              className="animate-check-circle"
              transform="rotate(-90 66 66)"
            />
            <path
              d="M42 68 L59 85 L92 50"
              stroke="url(#celebracion-aurora)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
              pathLength="100" strokeDasharray="100" strokeDashoffset="100"
              className="animate-check-mark"
            />
          </svg>
        </div>

        <h2 className="mt-6 font-heading font-extrabold text-2xl sm:text-3xl animate-pop-in" style={{ animationDelay: "0.35s" }}>
          {esSalida ? "¡Salida registrada!" : "¡Entrada registrada!"}
        </h2>
        <p className="mt-2 text-muted-foreground animate-pop-in" style={{ animationDelay: "0.5s" }}>
          {esSalida
            ? (horas != null ? `Sumaste ${horas} h a tu meta. ¡Buen trabajo!` : "Tus horas se sumaron a tu meta.")
            : (hora ? `Entrada a las ${hora}. ¡Que tengas un gran día!` : "¡Que tengas un gran día!")}
        </p>
      </div>
    </div>
  );
}
