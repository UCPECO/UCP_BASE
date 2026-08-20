import { useEffect, useRef } from "react";

// Recarga los datos cuando el usuario vuelve a la pestaña o a la ventana
// (visibilitychange / focus), con un mínimo de `minSegundos` entre recargas
// para no saturar el servidor si cambia de pestaña seguido.
export default function useRecargarAlVolver(recargar, minSegundos = 20) {
  const ultima = useRef(0);
  const recargarRef = useRef(recargar);
  recargarRef.current = recargar;

  useEffect(() => {
    const intentar = () => {
      const ahora = Date.now();
      if (ahora - ultima.current < minSegundos * 1000) return;
      ultima.current = ahora;
      recargarRef.current?.();
    };
    const alVisible = () => { if (document.visibilityState === "visible") intentar(); };
    document.addEventListener("visibilitychange", alVisible);
    window.addEventListener("focus", intentar);
    return () => {
      document.removeEventListener("visibilitychange", alVisible);
      window.removeEventListener("focus", intentar);
    };
  }, [minSegundos]);
}
