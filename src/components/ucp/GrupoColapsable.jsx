import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function GrupoColapsable({ titulo, contador, subtitulo, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 text-left">
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", !open && "-rotate-90")} />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{titulo}</p>
            {subtitulo && <p className="text-xs text-muted-foreground truncate">{subtitulo}</p>}
          </div>
        </div>
        {contador != null && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground shrink-0">
            {contador}
          </span>
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-3 space-y-3 border-t border-border/60">{children}</div>}
    </div>
  );
}