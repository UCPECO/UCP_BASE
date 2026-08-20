import React, { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

// Diálogo de confirmación propio (reemplaza el confirm() nativo del navegador,
// que se ve mal en móvil y es fácil de aceptar por accidente).
export default function ConfirmDialog({
  open,
  onOpenChange,
  titulo = "¿Confirmar?",
  descripcion,
  textoConfirmar = "Confirmar",
  destructivo = false,
  cargando = false,
  onConfirmar,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className={"h-5 w-5 shrink-0 " + (destructivo ? "text-rose-600" : "text-amber-500")} />
            {titulo}
          </DialogTitle>
        </DialogHeader>
        {descripcion && <p className="text-sm text-muted-foreground whitespace-pre-line">{descripcion}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cargando}>Cancelar</Button>
          <Button
            variant={destructivo ? "destructive" : "default"}
            disabled={cargando}
            onClick={async () => { await onConfirmar?.(); }}
          >
            {cargando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook: const { confirmar, dialogoConfirm } = useConfirm();
// if (await confirmar({ titulo: "...", descripcion: "..." })) { ... }
// y renderiza {dialogoConfirm} al final del JSX.
export function useConfirm() {
  const [estado, setEstado] = useState({ open: false });
  const resolverRef = useRef(null);

  const confirmar = (opts = {}) =>
    new Promise((resolve) => {
      resolverRef.current = resolve;
      setEstado({ open: true, ...opts });
    });

  const cerrar = (ok) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setEstado((e) => ({ ...e, open: false }));
  };

  const dialogoConfirm = (
    <ConfirmDialog
      open={estado.open}
      onOpenChange={(v) => { if (!v) cerrar(false); }}
      titulo={estado.titulo}
      descripcion={estado.descripcion}
      textoConfirmar={estado.textoConfirmar}
      destructivo={estado.destructivo}
      onConfirmar={() => cerrar(true)}
    />
  );

  return { confirmar, dialogoConfirm };
}

// ---- Confirmador global ----
// Se monta UNA vez en App (<ConfirmadorGlobal />) y cualquier pantalla puede
// llamar: if (await confirmarGlobal({ titulo, descripcion, destructivo })) { ... }
let manejador = null;
export const registrarConfirmador = (fn) => { manejador = fn; };
export const confirmarGlobal = (opts = {}) => {
  if (manejador) return manejador(opts);
  // Respaldo si aún no está montado (no debería pasar dentro de la app)
  return Promise.resolve(window.confirm(opts.descripcion || opts.titulo || "¿Confirmar?"));
};

export function ConfirmadorGlobal() {
  const [estado, setEstado] = useState({ open: false });
  const resolverRef = useRef(null);

  React.useEffect(() => {
    registrarConfirmador((opts) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setEstado({ open: true, ...opts });
      })
    );
    return () => registrarConfirmador(null);
  }, []);

  const cerrar = (ok) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setEstado((e) => ({ ...e, open: false }));
  };

  return (
    <ConfirmDialog
      open={estado.open}
      onOpenChange={(v) => { if (!v) cerrar(false); }}
      titulo={estado.titulo}
      descripcion={estado.descripcion}
      textoConfirmar={estado.textoConfirmar}
      destructivo={estado.destructivo}
      onConfirmar={() => cerrar(true)}
    />
  );
}
