import React, { useEffect, useRef, useState } from "react";
import { Moon, Sun, Leaf, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ucp-theme";
const THEME_COLOR = { dark: "#050505", light: "#f4f5fa", selva: "#FFF5E5" };

const TEMAS = [
  { id: "dark", nombre: "Aurora (oscuro)", icon: Moon },
  { id: "light", nombre: "Claro", icon: Sun },
  { id: "selva", nombre: "Selva fresca", icon: Leaf },
];

function aplicarTema(theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("selva", theme === "selva");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLOR[theme] || THEME_COLOR.dark);
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* modo incógnito */ }
}

// Selector de tema (Aurora oscuro / Claro / Selva). La elección es local
// por usuario (localStorage), no afecta a nadie más. Vive sobre fondos
// oscuros (sidebar/topbar), por eso usa los colores del sidebar.
export default function ThemeToggle({ className }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || "dark"; } catch { return "dark"; }
  });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { aplicarTema(theme); }, [theme]);

  useEffect(() => {
    if (!open) return;
    const cerrar = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("touchstart", cerrar);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("touchstart", cerrar);
    };
  }, [open]);

  const Actual = TEMAS.find((t) => t.id === theme) || TEMAS[0];

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors active:scale-90"
        title={`Tema: ${Actual.nombre} — cambiar`}
        aria-label="Cambiar tema de color"
      >
        <Actual.icon className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl z-50 overflow-hidden animate-scale-in">
          <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
            Tema del sitio
          </p>
          {TEMAS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTheme(t.id); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-sidebar-accent transition-colors"
            >
              <t.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{t.nombre}</span>
              {theme === t.id && <Check className="h-4 w-4 text-sidebar-primary" />}
            </button>
          ))}
          <p className="px-3 py-2 text-[10px] text-sidebar-foreground/40 border-t border-sidebar-border">
            Solo se guarda en tu dispositivo
          </p>
        </div>
      )}
    </div>
  );
}
