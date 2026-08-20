import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Search, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "encargado", label: "Encargado" },
  { value: "servicio_social", label: "Servicio Social" },
  { value: "voluntario", label: "Voluntario" },
  { value: "practicas_profesionales", label: "Prácticas Profesionales" },
];

export default function GestionRoles() {
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    try {
      const us = await base44.entities.User.list("full_name", 500);
      setUsers(us);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const handleChange = async (userId, newRole) => {
    setSavingId(userId);
    try {
      await base44.entities.User.update(userId, { role: newRole });
      setUsers(us => us.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast({ title: "Rol actualizado", description: ROLES.find(r => r.value === newRole)?.label });
    } catch (e) {
      toast({ title: "Error al cambiar rol", variant: "destructive" });
    } finally { setSavingId(null); }
  };

  const filtered = users.filter(u =>
    !search || (u.nombre_completo || u.full_name || "").toLowerCase().includes(search.toLowerCase()) || (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground font-heading">Gestión de roles</h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">Cambia el rol de cualquier usuario al instante</p>
          </div>
        </div>
        <div className="relative w-40 sm:w-56 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
      </div>
      <div className="p-3 max-h-96 overflow-y-auto scrollbar-thin space-y-1">
        {loading ? (
          <div className="flex justify-center py-6"><div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin resultados.</p>
        ) : filtered.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50">
            <Avatar user={u} />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{u.nombre_completo || u.full_name || "—"}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <select
              value={u.role || "voluntario"}
              disabled={savingId === u.id}
              onChange={(e) => handleChange(u.id, e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm font-medium disabled:opacity-50"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ user }) {
  if (user.foto_perfil) {
    return <img src={user.foto_perfil} alt="" className="h-9 w-9 rounded-full object-cover shrink-0" />;
  }
  return (
    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm shrink-0">
      {(user.nombre_completo || user.full_name || "?").charAt(0)}
    </div>
  );
}