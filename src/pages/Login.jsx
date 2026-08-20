import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2, Eye, EyeOff, ShieldCheck, RefreshCw } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [captcha, setCaptcha] = useState(null); // { id, pregunta }
  const [captchaRespuesta, setCaptchaRespuesta] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const cargarCaptcha = useCallback(async () => {
    setCaptchaRespuesta("");
    try {
      setCaptcha(await base44.auth.getCaptcha());
    } catch {
      setCaptcha(null);
      setError("No se pudo cargar el captcha. Revisa tu conexión y recarga la página.");
    }
  }, []);

  useEffect(() => { cargarCaptcha(); }, [cargarCaptcha]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!captcha) {
      setError("El captcha aún no carga. Espera un momento e inténtalo de nuevo.");
      return;
    }
    setLoading(true);
    try {
      await base44.auth.loginViaEmailPassword(email, password, { id: captcha.id, respuesta: captchaRespuesta });
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Correo o contraseña incorrectos");
      cargarCaptcha(); // el captcha es de un solo uso: pedir uno nuevo tras cada intento
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Inicia sesión"
      subtitle="Accede a tu cuenta de UCP Tracker"
      footer={
        <span className="text-sm text-muted-foreground">
          ¿No tienes cuenta? El administrador la crea por ti desde la pestaña de Personal.
        </span>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Correo</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="tu.correo@institucion.edu.mx"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Contraseña</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type={verPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 pr-10 h-12"
              required
            />
            <button
              type="button"
              onClick={() => setVerPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              title={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              tabIndex={-1}
            >
              {verPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Captcha anti-bots */}
        <div className="space-y-2">
          <Label htmlFor="captcha" className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-primary" /> Verificación humana
          </Label>
          <div className="flex gap-2">
            <div className="flex items-center justify-between flex-1 h-12 px-3 rounded-md border border-input bg-muted/50 select-none">
              <span className="text-sm font-medium">{captcha ? captcha.pregunta : "Cargando…"}</span>
              <button
                type="button"
                onClick={cargarCaptcha}
                className="text-muted-foreground hover:text-foreground transition-colors ml-2"
                title="Nueva operación"
                tabIndex={-1}
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <Input
              id="captcha"
              type="number"
              inputMode="numeric"
              autoComplete="off"
              placeholder="?"
              value={captchaRespuesta}
              onChange={(e) => setCaptchaRespuesta(e.target.value)}
              className="h-12 w-24 text-center"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading || !captcha}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Ingresando...
            </>
          ) : (
            "Iniciar sesión"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
