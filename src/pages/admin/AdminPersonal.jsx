import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserCog, Search, Mail, X, UserPlus, Eye, FileDown, Trash2, Archive, ArchiveRestore, Key, RefreshCw, Copy, Check } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import DetallePersonal from "@/components/ucp/DetallePersonal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { generarReportePersonalPdfMensual } from "@/lib/reportePersonal";
import { useAuth } from "@/lib/AuthContext";
import { AREAS, labelArea } from "@/lib/areas";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const ROLES = [
  { value: "admin", label: "Administrador" },
  { value: "encargado", label: "Encargado" },
  { value: "servicio_social", label: "Servicio Social" },
  { value: "voluntario", label: "Voluntario" },
];

const ROLE_STYLE = {
  admin: "bg-rose-100 text-rose-700",
  encargado: "bg-amber-100 text-amber-700",
  servicio_social: "bg-emerald-100 text-emerald-700",
  voluntario: "bg-sky-100 text-sky-700",
};

const NUEVO_VACIO = {
  full_name: "",
  email: "",
  password: "",
  role: "servicio_social",
  area: "",
  matricula: "",
  telefono: "",
};

function generarPasswordAleatoria() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pwd = "";
  const arr = new Uint32Array(10);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 10; i++) pwd += chars[arr[i] % chars.length];
  return pwd;
}

export default function AdminPersonal() {
  const { toast } = useToast();
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [bonos, setBonos] = useState([]);
  const [incidencias, setIncidencias] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(new Date().getMonth());
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [generando, setGenerando] = useState(false);
  const [search, setSearch] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [showCrear, setShowCrear] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const [creando, setCreando] = useState(false);
  const [credenciales, setCredenciales] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [detalleUser, setDetalleUser] = useState(null);
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const [cambiandoPwdUser, setCambiandoPwdUser] = useState(null);
  const [nuevaPwd, setNuevaPwd] = useState("");
  const [guardandoPwd, setGuardandoPwd] = useState(false);

  const load = async () => {
    try {
      const [us, regs, bons, incs, acts] = await Promise.all([
        base44.entities.User.list("full_name", 500),
        base44.entities.Registros_QR.list("-fecha", 1000),
        base44.entities.Bonos.list("-fecha", 1000),
        base44.entities.Incidencias.list("-created_date", 1000),
        base44.entities.Actividades.list("nombre", 200),
      ]);
      setUsers(us);
      setRegistros(regs);
      setBonos(bons);
      setIncidencias(incs);
      setActividades(acts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const setCampo = (campo, valor) => setNuevo((n) => ({ ...n, [campo]: valor }));

  const crearUsuario = async () => {
    if (!nuevo.full_name.trim() || !nuevo.email.trim() || !nuevo.password) {
      toast({ title: "Faltan datos", description: "Nombre, correo y contraseña son obligatorios", variant: "destructive" });
      return;
    }
    setCreando(true);
    try {
      const payload = {
        full_name: nuevo.full_name.trim(),
        email: nuevo.email.trim(),
        password: nuevo.password,
        role: nuevo.role,
        matricula: nuevo.matricula.trim(),
        telefono: nuevo.telefono.trim(),
      };
      if (nuevo.role === "encargado") payload.area_encargada = nuevo.area;
      if (nuevo.role === "servicio_social" || nuevo.role === "voluntario") payload.area_asignada = nuevo.area;

      const creado = await base44.auth.adminCreateUser(payload);
      setCredenciales({ email: creado.email, password: nuevo.password, nombre: creado.full_name });
      setNuevo(NUEVO_VACIO);
      toast({ title: "Usuario creado", description: creado.email });
      load();
    } catch (e) {
      toast({ title: "Error al crear usuario", description: e.message, variant: "destructive" });
    } finally {
      setCreando(false);
    }
  };

  const copiarCredenciales = async () => {
    try {
      await navigator.clipboard.writeText(
        `UCP Horas — Acceso\nNombre: ${credenciales.nombre}\nCorreo: ${credenciales.email}\nContraseña: ${credenciales.password}`
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast({ title: "No se pudo copiar", description: "Copia los datos manualmente", variant: "destructive" });
    }
  };

  const changeRole = async (userId, newRole) => {
    setSavingId(userId);
    try {
      const patch = { role: newRole };
      if (newRole !== "encargado") patch.area_encargada = "";
      if (newRole !== "servicio_social" && newRole !== "voluntario") patch.area_asignada = "";
      await base44.entities.User.update(userId, patch);
      setUsers((us) => us.map((u) => (u.id === userId ? {
        ...u,
        role: newRole,
        area_encargada: newRole === "encargado" ? u.area_encargada || "" : "",
        area_asignada: (newRole === "servicio_social" || newRole === "voluntario") ? u.area_asignada || "" : "",
      } : u)));
      toast({ title: "Rol actualizado", description: ROLES.find((r) => r.value === newRole)?.label });
    } catch (e) {
      toast({ title: "Error al cambiar rol", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const changeArea = async (userId, area) => {
    setSavingId(userId);
    try {
      await base44.entities.User.update(userId, { area_encargada: area });
      setUsers((us) => us.map((u) => (u.id === userId ? { ...u, area_encargada: area } : u)));
      toast({ title: "Área asignada", description: area ? labelArea(area) : "Sin área" });
    } catch (e) {
      toast({ title: "Error al asignar área", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const changeAreaAsignada = async (userId, area) => {
    setSavingId(userId);
    try {
      await base44.entities.User.update(userId, { area_asignada: area });
      setUsers((us) => us.map((u) => (u.id === userId ? { ...u, area_asignada: area } : u)));
      toast({ title: "Área designada", description: area ? labelArea(area) : "Sin área" });
    } catch (e) {
      toast({ title: "Error al asignar área", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const deleteUser = async (u) => {
    if (u.id === me?.id) { toast({ title: "No puedes eliminarte a ti mismo", variant: "destructive" }); return; }
    if (!confirm(`¿Eliminar a ${u.nombre_completo || u.full_name || u.email}? Esta acción no se puede deshacer.`)) return;
    try {
      await base44.entities.User.delete(u.id);
      toast({ title: "Usuario eliminado", description: u.email });
      setUsers((us) => us.filter((x) => x.id !== u.id));
    } catch (e) {
      toast({ title: "Error al eliminar usuario", description: e.message, variant: "destructive" });
    }
  };

  const toggleArchivar = async (u) => {
    const nuevoVal = !u.archivado;
    setSavingId(u.id);
    try {
      await base44.entities.User.update(u.id, { archivado: nuevoVal });
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, archivado: nuevoVal } : x)));
      toast({ title: nuevoVal ? "Usuario archivado" : "Usuario reactivado", description: u.nombre_completo || u.full_name || u.email });
    } catch (e) {
      toast({ title: "Error al archivar", variant: "destructive" });
    } finally {
      setSavingId(null);
    }
  };

  const changePassword = async (userId) => {
    if (!nuevaPwd || nuevaPwd.length < 4) {
      toast({ title: "Contraseña muy corta", description: "Mínimo 4 caracteres", variant: "destructive" });
      return;
    }
    setGuardandoPwd(true);
    try {
      await base44.auth.adminResetPassword(userId, nuevaPwd);
      toast({ title: "Contraseña actualizada", description: "El usuario debe usar la nueva contraseña para iniciar sesión" });
      setCambiandoPwdUser(null);
      setNuevaPwd("");
    } catch (e) {
      toast({ title: "Error al cambiar contraseña", description: e.message, variant: "destructive" });
    } finally {
      setGuardandoPwd(false);
    }
  };

  const filtered = users.filter((u) =>
    (!search ||
      (u.nombre_completo || u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.matricula || "").includes(search)) &&
    (!filtroRol || u.role === filtroRol) &&
    (mostrarArchivados || !u.archivado)
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">Personal</h1>
          <p className="text-sm text-muted-foreground mt-1">Crea las cuentas y administra a todo el personal UCP (alumnos y encargados)</p>
        </div>
        <Button onClick={() => { setShowCrear((s) => !s); setCredenciales(null); }}><UserPlus className="h-4 w-4 mr-2" /> Crear usuario</Button>
      </div>

      {showCrear && (
        <SectionCard
          title="Crear nuevo usuario"
          subtitle="Tú defines el correo y la contraseña: comparte las credenciales con la persona para que inicie sesión"
          icon={UserPlus}
          action={<button onClick={() => { setShowCrear(false); setCredenciales(null); }} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>}
        >
          {credenciales ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-1">
                <p className="text-sm font-semibold text-emerald-800">✅ Cuenta creada correctamente</p>
                <p className="text-sm text-emerald-900"><span className="font-medium">Nombre:</span> {credenciales.nombre}</p>
                <p className="text-sm text-emerald-900"><span className="font-medium">Correo:</span> {credenciales.email}</p>
                <p className="text-sm text-emerald-900"><span className="font-medium">Contraseña:</span> <code className="bg-white px-1.5 py-0.5 rounded border border-emerald-200">{credenciales.password}</code></p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={copiarCredenciales}>
                  {copiado ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copiado ? "Copiado" : "Copiar credenciales"}
                </Button>
                <Button variant="outline" onClick={() => setCredenciales(null)}>Crear otro usuario</Button>
                <Button onClick={() => { setShowCrear(false); setCredenciales(null); }}>Listo</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Nombre completo *</Label>
                  <Input value={nuevo.full_name} onChange={(e) => setCampo("full_name", e.target.value)} placeholder="Ej. María Pérez López" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Correo electrónico *</Label>
                  <Input type="email" value={nuevo.email} onChange={(e) => setCampo("email", e.target.value)} placeholder="correo@ejemplo.com" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contraseña *</Label>
                  <div className="flex gap-2">
                    <Input value={nuevo.password} onChange={(e) => setCampo("password", e.target.value)} placeholder="Mínimo 4 caracteres" />
                    <Button type="button" variant="outline" onClick={() => setCampo("password", generarPasswordAleatoria())} title="Generar contraseña aleatoria">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rol *</Label>
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={nuevo.role} onChange={(e) => setCampo("role", e.target.value)}>
                    {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {(nuevo.role === "encargado" || nuevo.role === "servicio_social" || nuevo.role === "voluntario") && (
                  <div className="space-y-1">
                    <Label className="text-xs">{nuevo.role === "encargado" ? "Área que encarga" : "Área asignada"}</Label>
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={nuevo.area} onChange={(e) => setCampo("area", e.target.value)}>
                      <option value="">Sin área</option>
                      {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Matrícula</Label>
                  <Input value={nuevo.matricula} onChange={(e) => setCampo("matricula", e.target.value)} placeholder="Opcional" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Teléfono</Label>
                  <Input value={nuevo.telefono} onChange={(e) => setCampo("telefono", e.target.value)} placeholder="Opcional" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button disabled={creando} onClick={crearUsuario}>
                  <UserPlus className="h-4 w-4 mr-2" /> {creando ? "Creando..." : "Crear cuenta"}
                </Button>
                <Button variant="outline" disabled={creando} onClick={() => { setShowCrear(false); setNuevo(NUEVO_VACIO); }}>Cancelar</Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="Reporte mensual consolidado" subtitle="Asistencias, incidencias y horas acumuladas de todo el personal" icon={FileDown}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Mes</Label>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Año</Label>
            <Input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="h-9 w-24" />
          </div>
          <Button disabled={generando} onClick={() => {
            setGenerando(true);
            try {
              generarReportePersonalPdfMensual({ usuarios: users, registros, bonos, incidencias, actividades, mes, anio });
              toast({ title: "Reporte generado" });
            } catch (e) { console.error(e); toast({ title: "Error al generar el reporte", variant: "destructive" }); }
            finally { setGenerando(false); }
          }}>
            <FileDown className="h-4 w-4 mr-2" /> {generando ? "Generando..." : "Descargar PDF"}
          </Button>
        </div>
      </SectionCard>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, correo o matrícula..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap cursor-pointer select-none">
          <input type="checkbox" checked={mostrarArchivados} onChange={(e) => setMostrarArchivados(e.target.checked)} className="h-4 w-4 rounded border-input" />
          Mostrar archivados
        </label>
      </div>

      {filtered.length === 0 ? (
        <SectionCard><EmptyState title="Sin personal" message="No hay registros que coincidan con el filtro." icon={UserCog} /></SectionCard>
      ) : (
        <SectionCard title={`Personal registrado (${filtered.length})`} icon={UserCog}>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-3 pr-4 font-medium">Persona</th>
                  <th className="py-3 px-3 font-medium hidden md:table-cell">Matrícula</th>
                  <th className="py-3 px-3 font-medium hidden lg:table-cell">Facultad / Carrera</th>
                  <th className="py-3 px-3 font-medium hidden xl:table-cell">Teléfono</th>
                  <th className="py-3 px-3 font-medium">Rol</th>
                  <th className="py-3 px-3 font-medium hidden xl:table-cell">Área</th>
                  <th className="py-3 px-3 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <React.Fragment key={u.id}>
                    <tr className={`border-b border-border last:border-0 hover:bg-muted/40 ${u.archivado ? "opacity-50" : ""}`}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-3">
                          <button onClick={() => setDetalleUser(u)} title="Ver historial completo" className="p-1.5 rounded-lg hover:bg-muted text-primary shrink-0"><Eye className="h-4 w-4" /></button>
                          {u.foto_perfil ? (
                            <img src={u.foto_perfil} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0">
                              {(u.nombre_completo || u.full_name || "?").charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.nombre_completo || u.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {u.email || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 hidden md:table-cell text-muted-foreground">{u.matricula || "—"}</td>
                      <td className="py-3 px-3 hidden lg:table-cell text-muted-foreground">
                        <span className="flex items-center gap-1 truncate">{u.facultad || "—"}{u.carrera ? ` · ${u.carrera}` : ""}</span>
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell text-muted-foreground">{u.telefono || "—"}</td>
                      <td className="py-3 px-3">
                        <select
                          value={u.role || "voluntario"}
                          disabled={savingId === u.id}
                          onChange={(e) => changeRole(u.id, e.target.value)}
                          className={`h-8 rounded-md border-0 px-2 text-xs font-semibold disabled:opacity-50 cursor-pointer ${ROLE_STYLE[u.role] || ROLE_STYLE.voluntario}`}
                        >
                          {ROLES.map((r) => <option key={r.value} value={r.value} className="bg-card text-foreground">{r.label}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-3 hidden xl:table-cell">
                        {u.role === "encargado" ? (
                          <select
                            value={u.area_encargada || ""}
                            disabled={savingId === u.id}
                            onChange={(e) => changeArea(u.id, e.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50 cursor-pointer"
                          >
                            <option value="">Sin área</option>
                            {AREAS.map((a) => <option key={a.value} value={a.value} className="bg-card text-foreground">{a.label}</option>)}
                          </select>
                        ) : (u.role === "servicio_social" || u.role === "voluntario") ? (
                          <select
                            value={u.area_asignada || ""}
                            disabled={savingId === u.id}
                            onChange={(e) => changeAreaAsignada(u.id, e.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50 cursor-pointer"
                          >
                            <option value="">Sin área</option>
                            {AREAS.map((a) => <option key={a.value} value={a.value} className="bg-card text-foreground">{a.label}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setCambiandoPwdUser(cambiandoPwdUser?.id === u.id ? null : u); setNuevaPwd(""); }}
                            disabled={guardandoPwd}
                            title="Cambiar contraseña"
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 disabled:opacity-30 transition-colors"
                          >
                            <Key className="h-4 w-4" />
                          </button>
                          {u.archivado ? (
                            <button
                              onClick={() => toggleArchivar(u)}
                              disabled={savingId === u.id}
                              title="Reactivar (desarchivar)"
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 disabled:opacity-30 transition-colors"
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleArchivar(u)}
                              disabled={savingId === u.id || u.id === me?.id}
                              title={u.id === me?.id ? "No puedes archivarte a ti mismo" : "Archivar (ocultar sin borrar datos)"}
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteUser(u)}
                            disabled={u.id === me?.id}
                            title={u.id === me?.id ? "No puedes eliminarte a ti mismo" : "Eliminar usuario"}
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {cambiandoPwdUser?.id === u.id && (
                      <tr className="border-b border-border bg-blue-50/50">
                        <td colSpan={7} className="py-3 px-4">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <span className="text-sm font-medium text-blue-700 whitespace-nowrap">Nueva contraseña para {u.nombre_completo || u.full_name || u.email}:</span>
                            <Input
                              type="password"
                              placeholder="Escribe la nueva contraseña..."
                              value={nuevaPwd}
                              onChange={(e) => setNuevaPwd(e.target.value)}
                              className="h-9 flex-1 max-w-xs"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <Button size="sm" disabled={guardandoPwd} onClick={() => changePassword(u.id)} className="h-9">
                                {guardandoPwd ? "Guardando..." : "Guardar"}
                              </Button>
                              <Button size="sm" variant="outline" disabled={guardandoPwd} onClick={() => { setCambiandoPwdUser(null); setNuevaPwd(""); }} className="h-9">
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <DetallePersonal usuario={detalleUser} onClose={() => setDetalleUser(null)} />
    </div>
  );
}
