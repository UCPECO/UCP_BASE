import React, { useState } from "react";
import { Hand } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

// Botón de "poke" 👋: envía un toque (notificación interna + push nativa)
// a cualquier usuario. Lo usan admin y encargados desde las fichas de personal.
export default function BotonPoke({ usuarioId, nombre, size = "sm" }) {
  const { toast } = useToast();
  const [enviando, setEnviando] = useState(false);

  const poke = async (e) => {
    e?.stopPropagation?.(); // por si está dentro de una tarjeta clicable
    if (enviando) return;
    setEnviando(true);
    try {
      const token = localStorage.getItem("ucp_token") || localStorage.getItem("token") || "";
      const res = await fetch("/api/push/poke", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ usuario: usuarioId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Error");
      toast({ title: `👋 Toque enviado a ${nombre || "el usuario"}` });
    } catch (err) {
      toast({ title: "No se pudo enviar el toque", description: err.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <button
      onClick={poke}
      disabled={enviando}
      title={`Enviar un toque a ${nombre || "usuario"}`}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 ${
        size === "icon" ? "h-9 w-9" : "h-9 px-3 text-xs font-medium"
      }`}
    >
      <Hand className={`h-4 w-4 ${enviando ? "animate-pulse" : ""}`} />
      {size !== "icon" && (enviando ? "Enviando..." : "Toque")}
    </button>
  );
}
