import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { QrCode, LogIn, LogOut, Camera, CameraOff, CheckCircle2, AlertCircle, Clock, Timer } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import StatusBadge from "@/components/ucp/StatusBadge";
import CelebracionFichaje from "@/components/ucp/CelebracionFichaje";
import { Skeleton, ListaSkeleton } from "@/components/ucp/Skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { calcularHoras, formatearFecha, fechaHoy, horaActual } from "@/lib/ucpUtils";
import { AREAS, labelArea } from "@/lib/areas";

// Fecha/hora actual en zona Centro de México como Date local
function ahoraMexicoDate() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
}

// Segundos transcurridos desde la entrada del fichaje
function segundosTranscurridos(reg) {
  if (!reg?.fecha || !reg?.hora_entrada) return 0;
  const entrada = new Date(`${reg.fecha}T${reg.hora_entrada}:00`);
  const diff = Math.floor((ahoraMexicoDate() - entrada) / 1000);
  return Math.max(0, diff);
}

function formatoCronometro(seg) {
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = seg % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
  const [segundos, setSegundos] = useState(0);
  const [areaManual, setAreaManual] = useState("");
  const [celebracion, setCelebracion] = useState(null);
  const scannerRef = useRef(null);
  const html5QrRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const urlProcesadaRef = useRef(false);

  // Cronómetro en vivo mientras hay un fichaje abierto
  useEffect(() => {
    if (!registroAbierto) return;
    setSegundos(segundosTranscurridos(registroAbierto));
    const t = setInterval(() => setSegundos(segundosTranscurridos(registroAbierto)), 1000);
    return () => clearInterval(t);
  }, [registroAbierto?.id]);

  const load = async () => {
    if (!user?.id) return;
    try {
      const me = await base44.auth.me().catch(() => null);
      if (me?.area_asignada) setAreaManual((a) => a || me.area_asignada);
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

  // Extrae el token del QR. Formatos aceptados:
  //  - URL nueva:  https://sitio/fichar?t=<token>
  //  - token plano (por si el QR solo codifica el token)
  // Las URLs viejas (?area=...) se detectan para dar un mensaje claro.
  const extraerTokenQr = (text) => {
    const limpio = (text || "").trim();
    const m = limpio.match(/[?&]t=([A-Za-z0-9-]+)/);
    if (m) return { token: m[1] };
    if (/^[A-Za-z0-9-]{16,64}$/.test(limpio)) return { token: limpio };
    if (/[?&]area=/.test(limpio)) return { legacy: true };
    return { invalido: true, contenido: limpio.slice(0, 80) };
  };

  const handleQrDetected = (text) => {
    const r = extraerTokenQr(text);
    if (r.legacy) {
      toast({ title: "QR del sistema anterior", description: "Este código ya no sirve. Pide al encargado el QR nuevo del área.", variant: "destructive" });
      return;
    }
    if (r.invalido) {
      toast({ title: "QR no reconocido", description: r.contenido ? `Contenido: "${r.contenido}"` : "No se pudo leer el código.", variant: "destructive" });
      return;
    }
    ficharConToken(r.token);
  };

  const ficharConToken = (token) => {
    if (registroAbierto) registrarSalida(false);
    else registrarEntrada({ token });
  };

  const registrarEntrada = async ({ token = null, manual = false } = {}) => {
    if (!asignacion) { toast({ title: "No tienes asignación activa", variant: "destructive" }); return; }
    if (manual && !areaManual) { toast({ title: "Indica el área", description: "El fichaje manual requiere que indiques en qué área estás trabajando.", variant: "destructive" }); return; }
    try {
      const res = await base44.functions.invoke("ProcesarFichajeQR", { asignacion_id: asignacion.id, manual, area: manual ? areaManual : null, token });
      const data = res.data;
      if (data?.tipo === "presente") {
        setRegistroAbierto(data.registro);
        const areaTxt = data.registro?.area ? ` · Área: ${labelArea(data.registro.area) || data.registro.area}` : "";
        if (data?.ya_abierto) {
          toast({ title: "Ya tienes un fichaje abierto", description: `Entrada: ${data.registro.hora_entrada}. Escanea para registrar tu salida.` });
        } else {
          // Celebración a pantalla completa (check animado + vibración)
          setCelebracion({ tipo: "entrada", hora: data.registro.hora_entrada });
          if (data?.es_manual) {
            toast({ title: "Entrada manual registrada", description: `Hora: ${data.registro.hora_entrada}${areaTxt} · Se avisó al encargado del área.` });
          }
        }
      } else if (data?.tipo === "incidencia") {
        toast({ title: "Fichaje fuera de horario laboral", description: "Estás fuera del horario autorizado. Se registró una incidencia.", variant: "destructive" });
      } else if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
      }
      load();
    } catch (e) { toast({ title: "Error al registrar entrada", variant: "destructive" }); }
  };

  const registrarSalida = async (manual = false) => {
    if (!registroAbierto) return;
    try {
      const res = await base44.functions.invoke("RegistrarSalidaFichaje", { registro_id: registroAbierto.id, manual });
      const data = res.data;
      if (data?.error) { toast({ title: data.error, variant: "destructive" }); return; }
      const horas = data?.horas ?? calcularHoras(registroAbierto.hora_entrada, horaActual());
      // Celebración a pantalla completa con las horas sumadas
      setCelebracion({ tipo: "salida", horas });
      if (manual || data?.incidencia_generada) {
        toast({
          title: manual ? "Salida manual registrada" : "Salida registrada",
          description: `${data?.incidencia_generada ? "Incidencia por rebasar 17:15" : ""}${manual ? " · Se avisó al encargado del área" : ""}`,
        });
      }
      setRegistroAbierto(null);
      load();
    } catch (e) { toast({ title: "Error al registrar salida", variant: "destructive" }); }
  };

  // Al abrir /fichar?t=<token> desde la cámara nativa del teléfono (sin usar
  // el escáner interno), se ficha automáticamente la entrada o la salida.
  useEffect(() => {
    if (loading || !user?.id || urlProcesadaRef.current) return;
    const token = searchParams.get("t");
    const areaLegacy = searchParams.get("area");
    if (!token && !areaLegacy) return;
    urlProcesadaRef.current = true;
    setSearchParams({}, { replace: true });
    if (token) {
      ficharConToken(token);
    } else {
      toast({ title: "QR del sistema anterior", description: "Este código ya no sirve. Pide al encargado el QR nuevo del área.", variant: "destructive" });
    }
  }, [loading, user?.id]);

  if (loading) return (
    <div className="space-y-6 max-w-2xl mx-auto" aria-hidden="true">
      <div className="text-center space-y-2 flex flex-col items-center">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
      <div className="bg-card rounded-2xl border border-border p-5">
        <ListaSkeleton filas={3} />
      </div>
    </div>
  );

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
              <div className="flex-1">
                <p className="font-semibold text-amber-900">Tienes un fichaje abierto</p>
                <p className="text-sm text-amber-700">Entrada: {registroAbierto.hora_entrada} · {formatearFecha(registroAbierto.fecha)}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-bold text-amber-900 tabular-nums flex items-center gap-1.5">
                  <Timer className="h-5 w-5" /> {formatoCronometro(segundos)}
                </p>
                <p className="text-xs text-amber-700">≈ {Math.round((segundos / 3600) * 100) / 100} h acumuladas</p>
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
        {registroAbierto && (
          <p className="text-xs text-amber-700 mt-3 pt-3 border-t border-amber-200">
            Al terminar, escanea de nuevo el QR o usa el botón de salida: las horas se cuentan hasta ese momento.
          </p>
        )}
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
        {!registroAbierto && (
          <div className="mb-3">
            <label className="text-xs text-muted-foreground block mb-1">¿En qué área estás trabajando? *</label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={areaManual}
              onChange={(e) => setAreaManual(e.target.value)}
            >
              <option value="">Selecciona el área...</option>
              {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        )}
        <div className="flex gap-3">
          {!registroAbierto ? (
            <Button onClick={() => registrarEntrada({ manual: true })} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              <LogIn className="h-4 w-4 mr-2" /> Registrar entrada
            </Button>
          ) : (
            <Button onClick={() => registrarSalida(true)} className="flex-1 bg-rose-600 hover:bg-rose-700">
              <LogOut className="h-4 w-4 mr-2" /> Registrar salida
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          El fichaje manual queda marcado como <b>manual</b>, genera una incidencia leve y se notifica al encargado del área para su revisión.
        </p>
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
                    <p className="text-xs text-muted-foreground">{r.hora_entrada} → {r.hora_salida || "—"}{r.area ? ` · ${labelArea(r.area) || r.area}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {r.es_manual ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-600">manual</span> : null}
                    {r.estado_registro === "cerrado" && <span className="text-sm font-medium">{hrs}h</span>}
                    <StatusBadge status={r.estado_registro} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Celebración a pantalla completa al fichar */}
      {celebracion && (
        <CelebracionFichaje
          tipo={celebracion.tipo}
          hora={celebracion.hora}
          horas={celebracion.horas}
          onClose={() => setCelebracion(null)}
        />
      )}
    </div>
  );
}