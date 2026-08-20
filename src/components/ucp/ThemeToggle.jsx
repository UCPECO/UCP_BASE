import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ucp-theme";

function aplicarTema(theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f5fa" : "#050505");
  try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* modo incógnito */ }
}

// Botón sol/luna. Vive sobre fondos oscuros (sidebar/topbar), por eso
// usa los colores del sidebar en ambos modos.
export default function ThemeToggle({ className }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || "dark"; } catch { return "dark"; }
  });

  useEffect(() => { aplicarTema(theme); }, [theme]);

  const esClaro = theme === "light";
  return (
    <button
      onClick={() => setTheme(esClaro ? "dark" : "light")}
      className={cn(
        "p-2 rounded-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors active:scale-90",
        className
      )}
      title={esClaro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
      aria-label={esClaro ? "Cambiar a modo oscuro" : "Cambiar a modo claro"}
    >
      {esClaro ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
}
