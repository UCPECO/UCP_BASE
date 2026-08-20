import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

// Guarda de rutas por rol: aunque el menú oculta las páginas que no le
// corresponden al usuario, sin esta guarda podría escribir la URL a mano.
// Si no tiene permiso, se le redirige a su panel principal.
export const homePorRol = (role) =>
  role === "admin" ? "/admin" : role === "encargado" ? "/encargado" : "/alumno";

export default function RutaRol({ roles }) {
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role || "voluntario";

  if (!roles.includes(role)) {
    return <Navigate to={homePorRol(role)} replace state={{ desde: location.pathname }} />;
  }
  return <Outlet />;
}
