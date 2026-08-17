import React, { useState, useEffect } from "react";
import { Download } from "lucide-react";

// Botón "Instalar app": solo aparece cuando el navegador ofrece la instalación
// (Chrome/Edge/Android). En iOS no se muestra (Safari no expone el evento;
// ahí se instala desde Compartir → "Añadir a pantalla de inicio").
export default function BotonInstalar() {
  const [evento, setEvento] = useState(null);
  const [instalada, setInstalada] = useState(false);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setEvento(e); };
    const onInstalled = () => { setInstalada(true); setEvento(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalada(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (instalada || !evento) return null;

  const instalar = async () => {
    evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setInstalada(true);
    setEvento(null);
  };

  return (
    <button
      onClick={instalar}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
    >
      <Download className="h-4 w-4" /> Instalar app
    </button>
  );
}
