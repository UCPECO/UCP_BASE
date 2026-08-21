import React, { useState } from "react";
import { QrCode, Image, TrendingUp, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

// Tour de bienvenida para participantes nuevos: 3 pantallas con lo esencial.
// Se muestra una sola vez por dispositivo (marca en localStorage).
const PASOS = [
  {
    icon: QrCode,
    titulo: "Fichar es tu acción diaria",
    texto: "Al llegar a UCP escanea el QR con el botón central de la barra inferior. Al salir, escanéalo de nuevo: así se cuentan tus horas.",
    degradado: "from-[#884ef4] to-[#3b488c]",
  },
  {
    icon: Image,
    titulo: "Sube evidencias de tu trabajo",
    texto: "Desde «Mis evidencias» sube fotos de lo que haces. Tu encargado las revisa y las valida para tu constancia.",
    degradado: "from-[#0ea5e9] to-[#884ef4]",
  },
  {
    icon: TrendingUp,
    titulo: "Sigue tu progreso y tu racha",
    texto: "En «Mi progreso» ves tus horas, el anillo de avance hacia tu meta y tu racha de asistencia de lunes a viernes.",
    degradado: "from-[#10b981] to-[#0ea5e9]",
  },
];

export default function TourBienvenida({ alTerminar }) {
  const [paso, setPaso] = useState(0);
  const ultimo = paso === PASOS.length - 1;
  const P = PASOS[paso];

  const terminar = () => {
    try { localStorage.setItem("ucp_tour_visto", "1"); } catch {}
    alTerminar?.();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-3xl shadow-xl overflow-hidden animate-pop-in">
        {/* Ilustración del paso */}
        <div className={`bg-gradient-to-br ${P.degradado} h-36 flex items-center justify-center relative`}>
          <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at 30% 20%, white 0%, transparent 55%)" }} />
          <div className="h-20 w-20 rounded-3xl bg-white/15 backdrop-blur flex items-center justify-center">
            <P.icon className="h-10 w-10 text-white" />
          </div>
        </div>

        <div className="p-6 text-center">
          <h2 className="font-heading font-bold text-lg">{P.titulo}</h2>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{P.texto}</p>

          {/* Puntos de progreso */}
          <div className="flex justify-center gap-1.5 mt-5">
            {PASOS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === paso ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />
            ))}
          </div>

          <div className="flex items-center justify-between mt-6">
            <button onClick={terminar} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1">
              Saltar
            </button>
            <Button onClick={() => (ultimo ? terminar() : setPaso(paso + 1))} className="bg-primary text-primary-foreground">
              {ultimo ? <>¡Empezar! <Check className="h-4 w-4 ml-1.5" /></> : <>Siguiente <ArrowRight className="h-4 w-4 ml-1.5" /></>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Solo participantes (alumnos), una sola vez por dispositivo
export function debeMostrarTour(role) {
  if (role === "admin" || role === "encargado") return false;
  try { return localStorage.getItem("ucp_tour_visto") !== "1"; } catch { return false; }
}
