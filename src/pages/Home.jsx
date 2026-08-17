import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";

export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Sincroniza el rol y perfil desde la invitación (la primera vez que el
      // usuario entra, su rol de plataforma es 'user'; aquí se aplica el rol real).
      let role = user?.role || "voluntario";
      try {
        const res = await base44.functions.invoke("SincronizarPerfilInvitado", {});
        if (res?.data?.role) role = res.data.role;
      } catch (e) { /* si falla, usamos el rol que ya tenía */ }
      if (cancelled) return;
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "encargado") navigate("/encargado", { replace: true });
      else navigate("/alumno", { replace: true });
    })();
    return () => { cancelled = true; };
  }, [user, navigate]);

  return (
    <div className="fixed inset-0 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" />
    </div>
  );
}