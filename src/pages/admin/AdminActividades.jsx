import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { FolderKanban, Plus, Pencil, Trash2, UserCog, UserPlus, Check, Lock, Unlock, Users } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import AsignarAlumnosActividad from "@/components/ucp/AsignarAlumnosActividad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { confirmarGlobal } from "@/components/ucp/ConfirmDialog";
import { AREAS, labelArea } from "@/lib/areas";

const VACIO = { nombre: "", categoria: "", descripcion: "", activo: true };

export default function AdminActividades() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const miArea = user?.area_encargada || "";
  const [actividades, setActividades] = useState([]);
  const [encargados, setEncargados] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [asignarAct, setAsignarAct] = useState(null);

  const areasVisibles = isAdmin ? AREAS : AREAS.filter((a) => a.value === miArea);

  const load = async () => {
    try {
      const [acts, asigs] = await Promise.all([
        base44.entities.Actividades.list("nombre", 200),
        base44.entities.Asignaciones.list("-created_date", 1000),
      ]);
      setActividades(acts);
      setAsignaciones(asigs);
      if (isAdmin) {
        try {
          const us = await base44.entities.User.list("full_name", 500);
          setEncargados(us.filter((u) => u.role === "encargado"));
        } catch (e) { console.error("User.list (solo admin):", e); }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const actsDeArea = (area) => actividades.filter((a) => a.categoria === area);
  const inscritosDe = (actId) => asignaciones.filter((x) => x.actividad === actId && x.estado !== "cancelado").length;
  const encargadosDeArea = (area) => encargados.filter((u) => u.area_encargada === area);
  const areaCerrada = (area) => {
    const acts = actsDeArea(area);
    return acts.length > 0 && acts.every((a) => !a.activo);
  };

  const toggleEncargadoArea = async (encargadoId, area) => {
    const enc = encargados.find((u) => u.id === encargadoId);
    const quit = enc?.area_encargada === area;
    try {
      await base44.entities.User.update(encargadoId, { area_encargada: quit ? "" : area });
      toast({ title: quit ? "Encargado removido del área" : "Encargado asignado al área" });
      load();
    } catch (e) { toast({ title: "Error al asignar", variant: "destructive" }); }
  };

  const cerrarArea = async (area) => {
    try {
      await base44.entities.Actividades.updateMany({ categoria: area, activo: true }, { $set: { activo: false } });
      toast({ title: "Área cerrada", description: labelArea(area) });
      load();
    } catch (e) { toast({ title: "Error al cerrar área", variant: "destructive" }); }
  };
  const reabrirArea = async (area) => {
    try {
      await base44.entities.Actividades.updateMany({ categoria: area, activo: false }, { $set: { activo: true } });
      toast({ title: "Área reabierta", description: labelArea(area) });
      load();
    } catch (e) { toast({ title: "Error", variant: "destructive" }); }
  };

  const abrirNueva = (area) => {
    setEditId(null);
    setForm({ ...VACIO, categoria: area });
    setShowForm(true);
  };

  const handleEdit = (a) => {
    setEditId(a.id);
    setForm({ nombre: a.nombre, categoria: a.categoria, descripcion: a.descripcion || "", activo: a.activo });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.nombre || !form.categoria) { toast({ title: "Nombre y área requeridos", variant: "destructive" }); return; }
    try {
      if (editId) {
        await base44.entities.Actividades.update(editId, form);
        toast({ title: "Actividad actualizada" });
      } else {
        await base44.entities.Actividades.create(form);
        toast({ title: "Actividad creada" });
      }
      setShowForm(false); setEditId(null); setForm(VACIO);
      load();
    } catch (e) { toast({ title: "Error al guardar", variant: "destructive" }); }
  };

  const handleDelete = async (id) => {
    if (!(await confirmarGlobal({ titulo: "¿Eliminar esta actividad?", descripcion: "Se quita del catálogo. Las asignaciones existentes no se borran.", destructivo: true }))) return;
    await base44.entities.Actividades.delete(id);
    toast({ title: "Actividad eliminada" });
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading">{isAdmin ? "Áreas y actividades" : "Mi área"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? `${AREAS.length} áreas · ${actividades.length} actividad(es)` : (miArea ? labelArea(miArea) : "Sin área asignada")}
          </p>
        </div>
      </div>

      {showForm && (
        <SectionCard title={editId ? "Editar actividad" : "Nueva actividad"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1.5 block">Nombre *</Label>
              <Input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <Label className="mb-1.5 block">Área *</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                disabled={!isAdmin}
              >
                <option value="">Selecciona…</option>
                {(isAdmin ? AREAS : AREAS.filter((a) => a.value === miArea)).map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Activa</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.value === "true" })}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="mb-1.5 block">Descripción</Label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={handleSubmit}>{editId ? "Guardar" : "Crear"}</Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null); }}>Cancelar</Button>
          </div>
        </SectionCard>
      )}

      {asignarAct && (
        <AsignarAlumnosActividad actividad={asignarAct} onClose={() => setAsignarAct(null)} />
      )}

      {!isAdmin && !miArea ? (
        <SectionCard><EmptyState title="Sin área asignada" message="Contacta al administrador para que te asigne un área." icon={FolderKanban} /></SectionCard>
      ) : (
        <div className="space-y-6">
          {areasVisibles.map((area) => {
            const acts = actsDeArea(area.value);
            const encs = encargadosDeArea(area.value);
            const cerrada = areaCerrada(area.value);
            return (
              <SectionCard
                key={area.value}
                title={area.label}
                subtitle={`${acts.length} actividad(es) · ${encs.length} encargado(s)`}
                icon={FolderKanban}
                action={
                  <div className="flex items-center gap-2">
                    {cerrada && <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">Cerrada</span>}
                    {isAdmin && (cerrada ? (
                      <Button size="sm" variant="outline" onClick={() => reabrirArea(area.value)}><Unlock className="h-4 w-4 mr-1" /> Reabrir</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => cerrarArea(area.value)}><Lock className="h-4 w-4 mr-1" /> Cerrar área</Button>
                    ))}
                    <Button size="sm" onClick={() => abrirNueva(area.value)}><Plus className="h-4 w-4 mr-1" /> Nueva actividad</Button>
                  </div>
                }
              >
                {isAdmin && (
                  <div className="mb-4">
                    <Label className="mb-1.5 block flex items-center gap-1.5 text-xs text-muted-foreground"><UserCog className="h-3.5 w-3.5" /> Encargados del área</Label>
                    {encargados.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No hay usuarios con rol encargado.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {encargados.map((u) => {
                          const on = u.area_encargada === area.value;
                          return (
                            <button key={u.id} type="button" onClick={() => toggleEncargadoArea(u.id, area.value)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${on ? "bg-emerald-50 ring-1 ring-primary/30 text-foreground" : "bg-muted/60 hover:bg-muted"}`}>
                              <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary" : "border-input"}`}>
                                {on && <Check className="h-3 w-3 text-primary-foreground" />}
                              </div>
                              {u.nombre_completo || u.full_name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {acts.length === 0 ? (
                  <EmptyState title="Sin actividades" message="Agrega la primera actividad de esta área." icon={FolderKanban} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {acts.map((a) => (
                      <div key={a.id} className="rounded-xl border border-border bg-secondary/30 p-4 flex flex-col">
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-semibold">{a.nombre}</p>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${a.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{a.activo ? "Activa" : "Inactiva"}</span>
                        </div>
                        {a.descripcion && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{a.descripcion}</p>}
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span>{inscritosDe(a.id)} inscrito(s)</span>
                        </div>
                        <div className="mt-3">
                          <Button variant="outline" size="sm" className="w-full" onClick={() => setAsignarAct(a)}><UserPlus className="h-4 w-4 mr-1.5" /> Asignar alumnos</Button>
                        </div>
                        <div className="flex items-center justify-end mt-3 gap-1">
                          <button onClick={() => handleEdit(a)} className="p-1.5 hover:bg-muted rounded-lg"><Pencil className="h-4 w-4 text-blue-600" /></button>
                          <button onClick={() => handleDelete(a.id)} className="p-1.5 hover:bg-rose-50 rounded-lg"><Trash2 className="h-4 w-4 text-rose-600" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            );
          })}
        </div>
      )}
    </div>
  );
}