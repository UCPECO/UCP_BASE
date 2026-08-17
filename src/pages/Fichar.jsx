import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { QrCode, LogIn, LogOut, Camera, CameraOff, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import StatusBadge from "@/components/ucp/StatusBadge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { calcularHoras, formatearFecha, fechaHoy, horaActual } from "@/lib/ucpUtils";

export default function Fichar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [asignacion, setAsignacion] = useState(null);
  const [actividad, setActividad] = useState(null);
  const [registroAbierto, setRegistroAbierto] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [qrResult, setQrResult] = useState("");
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);

  const load = async () => {
    if (!user?.id) return;
    try {
      const asigs = await base44.entities.Asignaciones.filter({ usuario: user.id, estado: "activo" }, "-created_date", 5);
      const activa = asigs[0] || null;
      setAsignacion(activa);
      if (activa?.actividad) {
        try { setActividad(await base44.entities.Actividades.get(activa.actividad)); } catch {}
      }
      const regs = await base44.entities.Registros_QR.filter({ usuario: user.id }, "-fecha", 20);
      setRegistros(regs);
      setRegistroAbierto(regs.find(r => r.estado_registro === "abierto") || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [user?.id]);

  const startScan = () => {
    setQrResult("");
    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.onload = () => {
      if (!window.Html5Qrcode) return;
      const el = document.getElementById("qr-reader");
      if (!el) return;
      const qr = new window.Html5Qrcode("qr-reader");
      html5QrRef.current = qr;
      qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setQrResult(decodedText);
          stopScan();
          handleQrDetected(decodedText);
        },
        () => {}
      ).then(() => setScanning(true)).catch((err) => {
        setQrResult("Error al iniciar cámara: " + err);
      });
    };
    document.body.appendChild(script);
  };

  const stopScan = () => {
    if (html5QrRef.current) {
      html5QrRef.current.stop().then(() => {
        html5QrRef.current.clear();
        setScanning(false);
      }).catch(() => setScanning(false));
    }
  };

  useEffect(() => () => { if (html5QrRef.current) { try { html5QrRef.current.stop(); } catch {} } }, []);

  const handleQrDetected = (text) => {
    try {
      const url = new URL(text);
      const area = url.searchParams.get("area");
      const exp = url.searchParams.get("exp");
      if (!area) {
        toast({ title: "QR no válido", description: "El código no contiene un área.", variant: "destructive" });
        return;
      }
      if (exp) {
        const fechaExp = new Date(exp + "T23:59:59");
        if (!isNaN(fechaExp.getTime()) && fechaExp < new Date()) {
          toast({ title: "QR expirado", description: "El código QR ha expirado.", variant: "destructive" });
          return;
        }
      }
      toast({ title: "QR válido", description: `Área: ${area}` });
      if (registroAbierto) {
        registrarSalida();
      } else {
        registrarEntrada();
      }
    } catch {
      toast({ title: "QR no válido para fichaje", variant: "destructive" });
    }
  };

  const registrarEntrada = async () => {
    if (!asignacion) { toast({ title: "No tienes asignación activa", variant: "destructive" }); return; }
    try {
      const res = await base44.functions.invoke("ProcesarFichajeQR", { asignacion_id: asignacion.id });
      const data = res.data;
      if (data?.tipo === "presente") {
        setRegistroAbierto(data.registro);
        if (data?.ya_abierto) {
          toast({ title: "Ya tienes un fichaje abierto", description: `Entrada: ${data.registro.hora_entrada}. Escanea para registrar tu salida.` });
        } else {
          toast({ title: "✓ Entrada registrada", description: `Hora: ${data.registro.hora_entrada}${data.clase ? ` · ${data.clase}` : ""}` });
        }
      } else if (data?.tipo === "incidencia") {
        toast({ title: "Fichaje fuera de horario laboral", description: "Estás fuera del horario autorizado. Se registró una incidencia.", variant: "destructive" });
      } else if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
      }
      load();
    } catch (e) { toast({ title: "Error al registrar entrada", variant: "destructive" }); }
  };

  const registrarSalida = async () => {
    if (!registroAbierto) return;
    try {
      const res = await base44.functions.invoke("RegistrarSalidaFichaje", { registro_id: registroAbierto.id });
      const data = res.data;
      if (data?.error) { toast({ title: data.error, variant: "destructive" }); return; }
      const horas = data?.horas ?? calcularHoras(registroAbierto.hora_entrada, horaActual());
      toast({
        title: "✓ Salida registrada",
        description: `Horas: ${horas}h${data?.incidencia_generada ? " · Incidencia por rebasar 17:15" : ""}`,
      });
      setRegistroAbierto(null);
      load();
    } catch (e) { toast({ title: "Error al registrar salida", variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Fichar</h1>
        <p className="text-sm text-muted-foreground mt-1">Escanea el QR de UCP para registrar tu asistencia</p>
      </div>

      {/* Estado actual */}
      <div className={`rounded-2xl p-5 border-2 ${registroAbierto ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
        <div className="flex items-center gap-3">
          {registroAbierto ? (
            <>
              <div className="h-12 w-12 rounded-full bg-amber-500 flex items-center justify-center"><LogIn className="h-6 w-6 text-white" /></div>
              <div>
                <p className="font-semibold text-amber-900">Tienes un registro abierto</p>
                <p className="text-sm text-amber-700">Entrada: {registroAbierto.hora_entrada} · {formatearFecha(registroAbierto.fecha)}</p>
              </div>
            </>
          ) : (
            <>
              <div className="h-12 w-12 rounded-full bg-emerald-500 flex items-center justify-center"><LogOut className="h-6 w-6 text-white" /></div>
              <div>
                <p className="font-semibold text-emerald-900">Listo para fichar</p>
                <p className="text-sm text-emerald-700">Escanea el QR para registrar tu entrada</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cámara QR */}
      <SectionCard title="Escáner QR" icon={QrCode}>
        <div id="qr-reader" className="w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-slate-900" />
        {qrResult && (
          <p className={`text-center mt-3 text-sm ${qrResult.includes("Error") ? "text-rose-600" : "text-emerald-600"}`}>
            {qrResult}
          </p>
        )}
        <div className="flex justify-center gap-3 mt-4">
          {!scanning ? (
            <Button onClick={startScan} className="bg-primary"><Camera className="h-4 w-4 mr-2" /> Escanear QR</Button>
          ) : (
            <Button onClick={stopScan} variant="outline"><CameraOff className="h-4 w-4 mr-2" /> Detener</Button>
          )}
        </div>
      </SectionCard>

      {/* Botones manuales */}
      <SectionCard title="Registro manual" subtitle="Si no puedes escanear, usa los botones">
        <div className="flex gap-3">
          {!registroAbierto ? (
            <Button onClick={registrarEntrada} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              <LogIn className="h-4 w-4 mr-2" /> Registrar entrada
            </Button>
          ) : (
            <Button onClick={registrarSalida} className="flex-1 bg-rose-600 hover:bg-rose-700">
              <LogOut className="h-4 w-4 mr-2" /> Registrar salida
            </Button>
          )}
        </div>
      </SectionCard>

      {/* Asignación actual */}
      {asignacion && actividad && (
        <SectionCard title="Tu asignación actual">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-semibold">{actividad.nombre}</p>
              <p className="text-sm text-muted-foreground">{actividad.categoria} · Meta: {actividad.meta_horas || 480}h</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Historial reciente */}
      <SectionCard title="Fichajes recientes" icon={Clock}>
        {registros.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin fichajes aún</p>
        ) : (
          <div className="space-y-2">
            {registros.slice(0, 5).map((r) => {
              const hrs = r.hora_salida ? calcularHoras(r.hora_entrada, r.hora_salida) : 0;
              return (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{formatearFecha(r.fecha)}</p>
                    <p className="text-xs text-muted-foreground">{r.hora_entrada} → {r.hora_salida || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.estado_registro === "cerrado" && <span className="text-sm font-medium">{hrs}h</span>}
                    <StatusBadge status={r.estado_registro} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}