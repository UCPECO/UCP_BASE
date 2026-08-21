import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Número que cuenta de 0 a su valor cuando entra en pantalla.
// Curva ease-out cúbica: arranque vivo, aterrizaje suave.
export default function NumeroAnimado({ value = 0, decimals = 0, duracion = 1000, suffix = "", className }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  const [actual, setActual] = useState(0);
  const meta = Number(value) || 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setActual(meta);
      return;
    }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duracion);
      const eased = 1 - Math.pow(1 - p, 3);
      setActual(meta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible, meta, duracion]);

  const texto = actual.toFixed(decimals);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {texto}{suffix}
    </span>
  );
}
