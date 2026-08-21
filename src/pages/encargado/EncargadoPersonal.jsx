import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserCog, Search, Mail, Eye } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import DetallePersonal from "@/components/ucp/DetallePersonal";
import { Input } from "@/components/ui/input";

const ROLES = [
  { value: "servicio_social", label: "Servicio Social" },
  { value: "voluntario", label: "Voluntario" },
  { value: "practicas_profesionales", label: "Prácticas Profesionales" },
  { value: "encargado", label: "Encargado" },
];

const ROLE_STYLE = {
  admin: "bg-rose-100 text-rose-700",
  encargado: "bg-amber-100 text-amber-700",
  servicio_social: "bg-emerald-100 text-emerald-700",
  voluntario: "bg-sky-100 text-sky-700",
  practicas_profesionales: "bg-violet-100 text-violet-700",
};

export default function EncargadoPersonal() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroRol, setFiltroRol] = useState("");
  const [detalleUser, setDetalleUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await base44.functions.invoke("ObtenerPersonalArea", {});
        setUsers(resp.data?.users || []);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = users.filter((u) =>
    (!search ||
      (u.nombre_completo || u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
      (u.matricula || "").includes(search)) &&
    (!filtroRol || u.role === filtroRol)
  );

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading">Personal</h1>
        <p className="text-sm text-muted-foreground mt-1">Consulta el historial y corrige fichaje o bajas como apoyo al administrador</p>
      </div>

      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/8 border border-primary/20 text-foreground text-xs">
        <UserCog className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <span>
          Como encargado puedes <b>consultar el historial</b> del personal y <b>dar de baja/reactivar asignaciones</b> de tu área.
          El <b>cierre de turnos</b> se realiza desde “Registros abiertos” (con reporte). La <b>edición de horas, premios, resolución de incidencias y datos generales</b> quedan reservadas al <b>administrador</b>.
        </span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre, correo o matrícula..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <SectionCard><EmptyState title="Sin personal" message="No hay registros que coincidan con el filtro." icon={UserCog} /></SectionCard>
      ) : (
        <SectionCard title={`Personal (${filtered.length})`} icon={UserCog}>
          {/* Móvil: tarjetas apiladas */}
          <div className="md:hidden space-y-3">
            {filtered.map((u) => (
              <button key={u.id} onClick={() => setDetalleUser(u)} className="w-full text-left p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  {u.foto_perfil ? (
                    <img src={u.foto_perfil} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary shrink-0">
                      {(u.nombre_completo || u.full_name || "?").charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{u.nombre_completo || u.full_name || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email || "—"}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {u.matricula || "Sin matrícula"}{(u.facultad || u.carrera) ? ` · ${u.facultad || ""}${u.carrera ? ` · ${u.carrera}` : ""}` : ""}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${ROLE_STYLE[u.role] || ROLE_STYLE.voluntario}`}>
                    {ROLES.find((r) => r.value === u.role)?.label || u.role || "—"}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {/* Escritorio: tabla */}
          <div className="overflow-x-auto scrollbar-thin hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-3 pr-4 font-medium">Persona</th>
                  <th className="py-3 px-3 font-medium hidden md:table-cell">Matrícula</th>
                  <th className="py-3 px-3 font-medium hidden lg:table-cell">Facultad / Carrera</th>
                  <th className="py-3 px-3 font-medium">Rol</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setDetalleUser(u)} title="Ver historial y correcciones" className="p-1.5 rounded-lg hover:bg-muted text-primary shrink-0"><Eye className="h-4 w-4" /></button>
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
                    <td className="py-3 px-3 hidden lg:table-cell text-muted-foreground truncate">{u.facultad || "—"}{u.carrera ? ` · ${u.carrera}` : ""}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_STYLE[u.role] || ROLE_STYLE.voluntario}`}>
                        {ROLES.find((r) => r.value === u.role)?.label || u.role || "—"}
                      </span>
                    </td>
                  </tr>
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