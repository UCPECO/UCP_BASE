import React, { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import {
  LayoutDashboard, UserCircle, Calendar, QrCode, ClipboardCheck, Image,
  Users, FolderKanban, AlertTriangle, Settings, LogOut, Menu, X, Award, CalendarDays, Clock,   BarChart3, UserCog, UserCheck, FileBadge, ClipboardList, GraduationCap, Boxes, ScrollText, CheckCheck, BadgeDollarSign
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROL_LABEL } from "@/lib/roles";
import { esAreaBodega } from "@/lib/areas";
import CampanaNotificaciones from "@/components/ucp/CampanaNotificaciones";
import BotonInstalar from "@/components/ucp/BotonInstalar";

const NAV = {
  admin: [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
    { to: "/admin/personal", label: "Personal", icon: UserCog },
    { to: "/admin/actividades", label: "Actividades", icon: FolderKanban },
    { to: "/admin/registros", label: "Registros abiertos", icon: ClipboardCheck },
    { to: "/admin/validacion", label: "Validación y ajustes", icon: CheckCheck },
    { to: "/admin/evidencias", label: "Evidencias", icon: Image },
    { to: "/admin/incidencias", label: "Incidencias", icon: AlertTriangle },
    { to: "/admin/pases-lista", label: "Pase de lista", icon: UserCheck },
    { to: "/admin/constancias", label: "Constancias", icon: FileBadge },
    { to: "/admin/encuestas", label: "Encuestas", icon: ClipboardList },
    { to: "/admin/evaluaciones", label: "Evaluaciones", icon: GraduationCap },
    { to: "/admin/inventario", label: "Inventario", icon: Boxes },
    { to: "/admin/ventas", label: "Ventas", icon: BadgeDollarSign },
    { to: "/admin/bitacora", label: "Bitácora", icon: ScrollText },
    { to: "/admin/eventos", label: "Eventos", icon: CalendarDays },
    { to: "/admin/bonos", label: "Horas de premio", icon: Award },
    { to: "/admin/qr", label: "Códigos QR", icon: QrCode },
    { to: "/admin/calendario", label: "Calendario", icon: CalendarDays },
    { to: "/admin/disponibilidad", label: "Disponibilidad", icon: Clock },
    { to: "/admin/config", label: "Configuración", icon: Settings },
  ],
  encargado: [
    { to: "/encargado", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/encargado/personal", label: "Personal", icon: UserCog },
    { to: "/encargado/alumnos", label: "Mis alumnos", icon: Users },
    { to: "/encargado/registros", label: "Registros abiertos", icon: ClipboardCheck },
    { to: "/encargado/evidencias", label: "Revisar evidencias", icon: Image },
    { to: "/encargado/incidencias", label: "Incidencias", icon: AlertTriangle },
    { to: "/encargado/pases-lista", label: "Pase de lista", icon: UserCheck },
    { to: "/encargado/constancias", label: "Constancias", icon: FileBadge },
    { to: "/encargado/evaluaciones", label: "Evaluaciones", icon: GraduationCap },
    { to: "/encargado/inventario", label: "Inventario", icon: Boxes },
    { to: "/encargado/ventas", label: "Ventas", icon: BadgeDollarSign },
    { to: "/encargado/actividades", label: "Mi área", icon: FolderKanban },
    { to: "/encargado/eventos", label: "Eventos UCP", icon: CalendarDays },
    { to: "/encargado/calendario", label: "Calendario", icon: CalendarDays },
    { to: "/encargado/disponibilidad", label: "Disponibilidad", icon: Clock },
  ],
  servicio_social: [
    { to: "/alumno", label: "Mi progreso", icon: LayoutDashboard, end: true },
    { to: "/alumno/actividades", label: "Actividades", icon: FolderKanban },
    { to: "/alumno/constancias", label: "Mis constancias", icon: FileBadge },
    { to: "/alumno/encuestas", label: "Encuestas", icon: ClipboardList },
    { to: "/alumno/perfil", label: "Mi perfil", icon: UserCircle },
    { to: "/fichar", label: "Fichar (QR)", icon: QrCode },
    { to: "/alumno/horario", label: "Mi horario", icon: Calendar },
    { to: "/alumno/evidencias", label: "Mis evidencias", icon: Image },
    { to: "/alumno/eventos", label: "Eventos UCP", icon: CalendarDays },
  ],
  voluntario: [
    { to: "/alumno", label: "Mi progreso", icon: LayoutDashboard, end: true },
    { to: "/alumno/actividades", label: "Actividades", icon: FolderKanban },
    { to: "/alumno/constancias", label: "Mis constancias", icon: FileBadge },
    { to: "/alumno/encuestas", label: "Encuestas", icon: ClipboardList },
    { to: "/alumno/perfil", label: "Mi perfil", icon: UserCircle },
    { to: "/fichar", label: "Fichar (QR)", icon: QrCode },
    { to: "/alumno/horario", label: "Mi horario", icon: Calendar },
    { to: "/alumno/evidencias", label: "Mis evidencias", icon: Image },
    { to: "/alumno/eventos", label: "Eventos UCP", icon: CalendarDays },
  ],
};

const ROLE_LABEL = ROL_LABEL;

// Etiquetas cortas para la barra inferior móvil
const TAB_LABEL = {
  "/admin": "Inicio", "/admin/personal": "Personal", "/admin/registros": "Registros", "/admin/validacion": "Validación",
  "/encargado": "Inicio", "/encargado/personal": "Personal", "/encargado/registros": "Registros", "/encargado/inventario": "Inventario",
  "/alumno": "Inicio", "/alumno/evidencias": "Evidencias", "/alumno/actividades": "Actividades",
};

// Barra inferior móvil: lo esencial al alcance del pulgar.
// Staff (admin/encargado): 4 accesos + Menú. Participantes: 2 + FICHAR
// central destacado (su acción diaria) + 1 + Menú.
const BOTTOM_STAFF = {
  admin: ["/admin", "/admin/personal", "/admin/registros", "/admin/validacion"],
  encargado: ["/encargado", "/encargado/personal", "/encargado/registros", "/encargado/inventario"],
};
const BOTTOM_PARTICIPANTE = { izquierda: ["/alumno", "/alumno/evidencias"], derecha: ["/alumno/actividades"] };

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  const role = user?.role || profile?.role || "voluntario";
  // El checklist de bodega solo aparece al personal de esa área (y al admin).
  // CU1/CU2 son etiquetas internas: su área sigue siendo "Bodega".
  const esDeBodega = role === "admin" || esAreaBodega(profile?.area_asignada) || esAreaBodega(profile?.area_encargada);
  let items = esDeBodega
    ? [...(NAV[role] || NAV.voluntario), { to: "/checklist-bodega", label: "Checklist bodega", icon: ClipboardCheck }]
    : (NAV[role] || NAV.voluntario);
  // El encargado de bodega no ve Ventas (solo registra entradas)
  if (role === "encargado" && esAreaBodega(profile?.area_encargada)) {
    items = items.filter((i) => !i.to.endsWith("/ventas"));
  }

  useEffect(() => {
    base44.auth.me().then(setProfile).catch(() => {});
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const name = profile?.nombre_completo || profile?.full_name || user?.full_name || user?.email || "Usuario";
  const usuarioId = profile?.id || user?.id;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar desktop */}
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30">
        <SidebarContent items={items} name={name} role={role} foto={profile?.foto_perfil} usuarioId={usuarioId} onLogout={handleLogout} />
      </aside>

      {/* Sidebar mobile */}
      {open && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 bg-sidebar text-sidebar-foreground z-50 flex flex-col animate-fade-in">
            <SidebarContent items={items} name={name} role={role} foto={profile?.foto_perfil} usuarioId={usuarioId} onLogout={handleLogout} onClose={() => setOpen(false)} />
          </aside>
        </>
      )}

      {/* Main */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile topbar */}
        <header className="lg:hidden sticky top-0 z-20 bg-sidebar text-sidebar-foreground px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 font-heading font-bold">
            <img src="/branding/logo-mono.png" alt="UCP" className="h-6 w-6 object-contain" /> UCP
          </div>
          <div className="flex items-center">
            <CampanaNotificaciones usuarioId={usuarioId} />
            <button onClick={handleLogout} className="p-2 -mr-2" title="Cerrar sesión"><LogOut className="h-5 w-5" /></button>
          </div>
        </header>

        <main className="flex-1 p-3 pb-24 sm:p-6 lg:p-8 lg:pb-8 max-w-7xl w-full mx-auto animate-fade-in">
          <Outlet />
        </main>

        {/* Barra inferior móvil */}
        <BarraInferior
          items={items}
          esParticipante={!BOTTOM_STAFF[role]}
          tabsStaff={BOTTOM_STAFF[role] || []}
          onMenu={() => setOpen(true)}
        />
      </div>
    </div>
  );
}

// Tab individual de la barra inferior
function TabInferior({ item, label }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => cn(
        "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] rounded-xl mx-0.5 transition-all active:scale-95",
        isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60"
      )}
    >
      {({ isActive }) => (
        <>
          <span className={cn("p-1 rounded-lg transition-colors", isActive && "bg-sidebar-primary/15")}>
            <item.icon className="h-5 w-5" />
          </span>
          <span className="text-[10px] font-medium leading-none">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function BarraInferior({ items, esParticipante, tabsStaff, onMenu }) {
  const buscar = (to) => items.find((i) => i.to === to);
  const menuBtn = (
    <button
      onClick={onMenu}
      className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] rounded-xl mx-0.5 text-sidebar-foreground/60 transition-all active:scale-95"
    >
      <span className="p-1"><Menu className="h-5 w-5" /></span>
      <span className="text-[10px] font-medium leading-none">Menú</span>
    </button>
  );

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar text-sidebar-foreground border-t border-sidebar-border shadow-[0_-4px_16px_rgba(0,0,0,0.15)] pb-[env(safe-area-inset-bottom)]">
      {esParticipante ? (
        <div className="grid grid-cols-5 items-end px-1">
          {BOTTOM_PARTICIPANTE.izquierda.map((to) => {
            const item = buscar(to);
            return item ? <TabInferior key={to} item={item} label={TAB_LABEL[to]} /> : <div key={to} />;
          })}
          {/* Acción central destacada: fichar con QR */}
          <div className="flex flex-col items-center">
            <NavLink
              to="/fichar"
              className={({ isActive }) => cn(
                "flex items-center justify-center h-14 w-14 -mt-5 rounded-full shadow-lg ring-4 ring-background transition-all active:scale-90",
                isActive ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground"
              )}
              title="Fichar con QR"
            >
              <QrCode className="h-6 w-6" />
            </NavLink>
            <span className="text-[10px] font-medium text-sidebar-foreground/60 mt-0.5">Fichar</span>
          </div>
          {BOTTOM_PARTICIPANTE.derecha.map((to) => {
            const item = buscar(to);
            return item ? <TabInferior key={to} item={item} label={TAB_LABEL[to]} /> : <div key={to} />;
          })}
          {menuBtn}
        </div>
      ) : (
        <div className="grid grid-cols-5 px-1">
          {tabsStaff.map((to) => {
            const item = buscar(to);
            return item ? <TabInferior key={to} item={item} label={TAB_LABEL[to]} /> : <div key={to} />;
          })}
          {menuBtn}
        </div>
      )}
    </nav>
  );
}

function SidebarContent({ items, name, role, onLogout, onClose, foto, usuarioId }) {
  return (
    <>
      <div className="flex items-center justify-between px-5 h-16 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <img src="/branding/logo-mono.png" alt="UCP" className="h-9 w-9 object-contain" />
          <div>
            <p className="font-heading font-bold text-sidebar-primary leading-tight">UCP Tracker</p>
            <p className="text-[10px] text-sidebar-foreground/70 uppercase tracking-wider">Servicio Social</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <CampanaNotificaciones usuarioId={usuarioId} alinear="izquierda" />
          {onClose && <button onClick={onClose} className="p-1 text-sidebar-foreground/70"><X className="h-5 w-5" /></button>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border">
        <div className="px-3 py-2 mb-2 flex items-center gap-2.5">
          {foto ? (
            <img src={foto} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
          ) : (
            <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center font-semibold text-sidebar-primary text-sm shrink-0">
              {(name || "?").charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-sidebar-primary truncate">{name}</p>
            <p className="text-xs text-sidebar-foreground/60 flex items-center gap-1">
              <Award className="h-3 w-3" /> {ROLE_LABEL[role]}
            </p>
          </div>
        </div>
        <BotonInstalar />
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" /> Cerrar sesión
        </button>
      </div>
    </>
  );
}