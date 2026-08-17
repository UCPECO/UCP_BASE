import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha } from "@/lib/ucpUtils";

// Hilo de comentarios de una evidencia (alumno ↔ encargado/admin).
// El backend fuerza el autor autenticado; aquí solo se envía el texto.
export default function ComentariosEvidencia({ evidenciaId }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comentarios, setComentarios] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef(null);

  const cargar = async () => {
    if (!evidenciaId) return;
    try {
      const data = await base44.entities.Comentarios_Evidencia.filter({ evidencia: evidenciaId }, "created_date", 200);
      setComentarios(data || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { cargar(); }, [evidenciaId]);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comentarios.length]);

  const enviar = async () => {
    const limpio = texto.trim();
    if (!limpio) return;
    setEnviando(true);
    try {
      await base44.entities.Comentarios_Evidencia.create({ evidencia: evidenciaId, comentario: limpio });
      setTexto("");
      cargar();
    } catch (e) {
      toast({ title: "No se pudo enviar el comentario", variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4 text-primary" /> Comentarios
        <span className="text-xs font-normal text-muted-foreground">({comentarios.length})</span>
      </p>

      <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
        {comentarios.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">Sin comentarios aún. Pregunta o aclara algo aquí.</p>
        )}
        {comentarios.map((c) => {
          const mio = c.usuario === user?.id;
          return (
            <div key={c.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${mio ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                <p className={`text-[11px] font-medium mb-0.5 ${mio ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {c.usuario_nombre || "Usuario"} · {formatearFecha(c.created_date)}
                </p>
                <p className="whitespace-pre-wrap break-words">{c.comentario}</p>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe un comentario…"
          className="flex-1"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
        />
        <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
