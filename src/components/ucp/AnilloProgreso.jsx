import React, { useEffect, useRef, useState } from "react";
import NumeroAnimado from "@/components/ucp/NumeroAnimado";

// Anillo de progreso SVG con degradado aurora (cyan → morado).
// El trazo arranca vacío y se dibuja al entrar en pantalla.
export default function AnilloProgreso({ value = 0, max = 100, size = 168, stroke = 14, children }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const pct = Math.min(1, max > 0 ? value / max : 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="anillo-aurora" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--accent))" />
            <stop offset="100%" stopColor="hsl(var(--primary))" />
          </linearGradient>
        </defs>
        {/* Riel de fondo */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        {/* Trazo de progreso con extremos redondeados */}
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="url(#anillo-aurora)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={visible ? c * (1 - pct) : c}
          className="anim-fill"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        {children ?? (
          <>
            <span className="font-heading font-extrabold text-3xl sm:text-4xl leading-none">
              <NumeroAnimado value={Math.round(pct * 100)} suffix="%" />
            </span>
            <span className="text-[11px] text-muted-foreground mt-1 font-medium uppercase tracking-wide">completado</span>
          </>
        )}
      </div>
    </div>
  );
}
