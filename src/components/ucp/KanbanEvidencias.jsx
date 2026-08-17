import React, { useState, useEffect } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useEncargadoData } from "@/lib/useEncargadoData";
import { Image, Link as LinkIcon, File, KanbanSquare } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";

const TIPO_ICON = { foto: Image, link: LinkIcon };
const COLUMNAS = [
  { id: "pendiente", titulo: "Pendientes", color: "bg-amber-100 text-amber-700" },
  { id: "regresada", titulo: "Regresadas", color: "bg-blue-100 text-blue-700" },
  { id: "aprobada", titulo: "Aprobadas", color: "bg-emerald-100 text-emerald-700" },
  { id: "rechazada", titulo: "Rechazadas", color: "bg-rose-100 text-rose-700" },
];

export default function KanbanEvidencias() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { loading, asignaciones, alumnos } = useEncargadoData();
  const [evidencias, setEvidencias] = useState([]);

  const load = async () => {
    try {
      const evs = await base44.entities.Evidencias.list("-created_date", 300);
      const asignIds = new Set(asignaciones.map(a => a.id));
      setEvidencias(evs.filter(e => asignIds.has(e.asignacion)));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { load(); }, [asignaciones]);

  const onDragEnd = async (result) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const ev = evidencias.find(e => e.id === draggableId);
    if (!ev) return;
    setEvidencias(prev => prev.map(e => e.id === ev.id ? { ...e, estado_evidencia: destination.droppableId } : e));
    try {
      const update = { estado_evidencia: destination.droppableId, aprobado_por: user.id };
      if (destination.droppableId === "rechazada" && !ev.comentario_revision) {
        update.comentario_revision = "Rechazada desde tablero Kanban";
      }
      if (destination.droppableId === "regresada" && !ev.comentario_revision) {
        update.comentario_revision = "Regresada para corrección desde tablero Kanban";
      }
      await base44.entities.Evidencias.update(ev.id, update);
      toast({
        title: destination.droppableId === "aprobada" ? "Evidencia aprobada" :
               destination.droppableId === "rechazada" ? "Evidencia rechazada" :
               destination.droppableId === "regresada" ? "Evidencia regresada" : "Evidencia en pendiente",
      });
      load();
    } catch (e) {
      toast({ title: "Error al mover evidencia", variant: "destructive" });
      setEvidencias(prev => prev.map(x => x.id === ev.id ? { ...x, estado_evidencia: source.droppableId } : x));
    }
  };

  if (loading) return null;

  return (
    <SectionCard title="Evidencias — Tablero" subtitle="Arrastra las tarjetas entre pendiente, regresada, aprobado y rechazado" icon={KanbanSquare}>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNAS.map(col => {
            const items = evidencias.filter(e => e.estado_evidencia === col.id);
            return (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}
                    className={`rounded-xl border-2 p-3 min-h-[220px] ${snapshot.isDraggingOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"}`}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${col.color}`}>{col.titulo}</span>
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin evidencias</p>}
                      {items.map((ev, idx) => {
                        const alumno = alumnos.find(a => a.id === ev.usuario);
                        const Icon = TIPO_ICON[ev.tipo_evidencia] || File;
                        return (
                          <Draggable draggableId={ev.id} index={idx} key={ev.id}>
                            {(p, s) => (
                              <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                                className={`bg-card rounded-lg border border-border shadow-sm p-3 ${s.isDragging ? "shadow-lg ring-2 ring-primary" : ""}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                  <p className="text-sm font-medium truncate flex-1">{nombreUsuario(alumno)}</p>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">{ev.descripcion}</p>
                                <p className="text-[10px] text-muted-foreground mt-1.5">{formatearFecha(ev.fecha_captura || ev.created_date)}</p>
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </SectionCard>
  );
}