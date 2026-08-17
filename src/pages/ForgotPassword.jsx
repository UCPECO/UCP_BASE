import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, ArrowLeft, ShieldAlert } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  return (
    <AuthLayout
      icon={ShieldAlert}
      title="¿Olvidaste tu contraseña?"
      subtitle="Contacta al administrador del sistema"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Volver al inicio de sesión
        </Link>
      }
    >
      <div className="space-y-4 text-center">
        <p className="text-sm text-foreground">
          Para restablecer tu contraseña, contacta al <strong>administrador del sistema</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          El administrador puede cambiar tu contraseña directamente desde el panel de <strong>Personal</strong> en la sección de administración.
        </p>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg py-2 px-3">
          <Mail className="h-3 w-3" />
          <span>Proporciona tu correo electrónico al admin para que te identifique</span>
        </div>
      </div>
    </AuthLayout>
  );
}
