import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Cpu, Plus, Trash2, Search, FileText } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import KpiCard from "@/components/ucp/KpiCard";
import EmptyState from "@/components/ucp/EmptyState";
import StatusBadge from "@/components/ucp/StatusBadge";
import SelectorElectronico from "@/components/ucp/SelectorElectronico";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha } from "@/lib/ucpUtils";
import { generarReporteBodega } from "@/lib/reporteBodega";
import GraficosBodega from "@/components/ucp/GraficosBodega";
import {
  CATEGORIAS_ELECTRONICOS,
  MATERIALES_PESO,
  CATEGORIAS_FLAT,
  CAT_LABEL,
  CAT_MEDIDA,
  MEDIDA_LABEL,
  labelCategoria,
  medidaDeRegistro,
} from "@/lib/catalogoElectronicos";

const nuevaLinea = () => ({
  proveedor: "",
  tipo_proveedor: "empresa",
  descripcion: "",
  fecha_recepcion: new Date().toISOString().split("T")[0],
  tipo_registro: "articulo",
  categoria: "",
  subcategoria: "",
  material: "",
  cantidad: 1,
  reparado_por: "",
  reparado_por_nombre: "",
});

export default function AdminElectronicos() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [registros, setRegistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [lineas, setLineas] = useState([nuevaLinea()]);
  const [mesReporte, setMesReporte] = useState(new Date().getMonth());
  const [anioReporte, setAnioReporte] = useState(new Date().getFullYear());
  const [estudiantes, setEstudiantes] = useState([]);

  const cargar = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Electronicos_Reciclados.list("-fecha_recepcion", 500);
      setRegistros(data);
    } catch {
      toast({ title: "Error al cargar electrónicos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    const cargarEstudiantes = async () => {
      try {
        const perfil = await base44.auth.me();
        let users = [];
        if (perfil.role === "admin") {
          users = await base44.entities.User.list("full_name", 500);
        } else {
          const res = await base44.functions.invoke("ObtenerPersonalArea", {});
          users = res.data?.users || [];
        }
        setEstudiantes(users.filter((u) => !u.archivado && (u.role === "servicio_social" || u.role === "voluntario")));
      } catch (e) {
        console.error(e);
      }
    };
    cargarEstudiantes();
  }, []);

  const actualizarLinea = (idx, campo, valor) => {
    setLineas(lineas.map((l, i) => (i === idx ? { ...l, [campo]: valor } : l)));
  };
  const actualizarSelector = (idx, patch) => {
    setLineas(lineas.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const agregarLinea = () => {
    const prev = lineas[lineas.length - 1];
    setLineas([...lineas, {
      ...nuevaLinea(),
      proveedor: prev?.proveedor || "",
      tipo_proveedor: prev?.tipo_proveedor || "empresa",
      fecha_recepcion: prev?.fecha_recepcion || new Date().toISOString().split("T")[0],
      tipo_registro: prev?.tipo_registro || "articulo",
    }]);
  };
  const insertLinea = (idx) => {
    const base = lineas[idx];
    const nueva = {
      ...nuevaLinea(),
      proveedor: base?.proveedor || "",
      tipo_proveedor: base?.tipo_proveedor || "empresa",
      fecha_recepcion: base?.fecha_recepcion || new Date().toISOString().split("T")[0],
      tipo_registro: base?.tipo_registro || "articulo",
    };
    const copia = [...lineas];
    copia.splice(idx + 1, 0, nueva);
    setLineas(copia);
  };
  const quitarLinea = (idx) => setLineas(lineas.length > 1 ? lineas.filter((_, i) => i !== idx) : lineas);

  const filaValida = (l) => {
    if (!l.proveedor || !l.categoria || !l.fecha_recepcion) return false;
    if (l.tipo_registro === "articulo" && (!l.subcategoria || !l.material)) return false;
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validas = lineas.filter(filaValida);
    if (validas.length === 0) {
      toast({ title: "Cada fila necesita proveedor, fecha y la categoría completa", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = validas.map((l) => ({
        fecha_recepcion: l.fecha_recepcion,
        proveedor: l.proveedor,
        tipo_proveedor: l.tipo_proveedor,
        tipo_registro: l.tipo_registro,
        categoria: l.categoria,
        subcategoria: l.subcategoria || null,
        material: l.material || null,
        medida: l.tipo_registro === "procesado" ? "kg" : "unidades",
        cantidad: Number(l.cantidad) || 1,
        descripcion: l.descripcion || null,
        creado_por: user?.id,
        reparado_por: l.reparado_por || null,
        reparado_por_nombre: l.reparado_por_nombre || null,
      }));
      await base44.entities.Electronicos_Reciclados.bulkCreate(payload);
      toast({ title: `${payload.length} registro(s) guardado(s)` });
      setLineas([nuevaLinea()]);
      cargar();
    } catch {
      toast({ title: "Error al registrar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.Electronicos_Reciclados.delete(id);
      toast({ title: "Registro eliminado" });
      cargar();
    } catch {
      toast({ title: "Error al eliminar", variant: "destructive" });
    }
  };

  const generarReporte = () => generarReporteBodega({
    titulo: "Reporte de Electrónicos Reciclados · UCP",
    registros, categorias: CATEGORIAS_FLAT, catMedida: CAT_MEDIDA, catLabel: CAT_LABEL, mes: mesReporte, anio: anioReporte,
  });

  const filtrados = registros.filter((m) => {
    const txt = `${m.proveedor || ""} ${m.material || ""} ${labelCategoria(m.categoria)} ${m.subcategoria || ""} ${m.descripcion || ""}`.toLowerCase();
    const matchBus = txt.includes(busqueda.toLowerCase());
    const matchCat = !filtroCat || m.categoria === filtroCat;
    const matchTipo = !filtroTipo || m.tipo_registro === filtroTipo;
    return matchBus && matchCat && matchTipo;
  });

  const medidaDe = (m) => medidaDeRegistro(m);
  const pesoTotal = registros.filter((m) => medidaDe(m) === "kg").reduce((a, m) => a + (m.cantidad || 0), 0);
  const unidadesTotal = registros.filter((m) => medidaDe(m) === "unidades").reduce((a, m) => a + (m.cantidad || 0), 0);
  const porCategoria = (cat) => registros.filter((m) => m.categoria === cat).length;
  const cantidadCategoria = (cat) => registros.filter((m) => m.categoria === cat).reduce((a, m) => a + (m.cantidad || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Bodega · Administración</p>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading mt-0.5">Electrónicos reciclados</h1>
        <p className="text-sm text-muted-foreground mt-1">Registra artículos por categorizar (unidades) y materiales procesados por peso (kg).</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Cpu} label="Registros" value={registros.length} tone="primary" />
        <KpiCard icon={Cpu} label="Peso procesado (kg)" value={Math.round(pesoTotal * 100) / 100} tone="blue" />
        <KpiCard icon={Cpu} label="Artículos (u)" value={unidadesTotal} tone="accent" />
        <KpiCard icon={Cpu} label="Procesados" value={registros.filter((m) => m.tipo_registro === "procesado").length} tone="rose" />
      </div>

      {/* Totales + reporte mensual */}
      <SectionCard title="Totales acumulados" subtitle="Genera el reporte mensual de electrónicos reciclados" icon={FileText}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">Peso acumulado</p>
            <p className="text-2xl font-bold font-heading text-primary mt-1">{Math.round(pesoTotal * 100) / 100} <span className="text-sm">kg</span></p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">Artículos acumulados</p>
            <p className="text-2xl font-bold font-heading text-primary mt-1">{unidadesTotal}</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">Cobre + aluminio + hierro</p>
            <p className="text-2xl font-bold font-heading text-primary mt-1">{["cobre","aluminio","hierro"].reduce((a, c) => a + cantidadCategoria(c), 0)} <span className="text-sm">kg</span></p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="text-xs text-muted-foreground">Placas PCB</p>
            <p className="text-2xl font-bold font-heading text-primary mt-1">{cantidadCategoria("placas_pcb")} <span className="text-sm">kg</span></p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-4 border-t border-border">
          <div>
            <Label className="mb-1.5 block text-sm">Mes del reporte</Label>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm w-44" value={mesReporte} onChange={(e) => setMesReporte(Number(e.target.value))}>
              {["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block text-sm">Año</Label>
            <Input type="number" className="w-28" value={anioReporte} onChange={(e) => setAnioReporte(Number(e.target.value))} />
          </div>
          <Button onClick={generarReporte}><FileText className="h-4 w-4 mr-2" /> Generar reporte mensual PDF</Button>
        </div>
      </SectionCard>

      {/* Gráficos */}
      <GraficosBodega registros={registros} categorias={CATEGORIAS_FLAT} catMedida={CAT_MEDIDA} catLabel={CAT_LABEL} />

      {/* Tabla de registro */}
      <SectionCard title="Registrar electrónicos" subtitle="Artículo (unidades) con cascada Categoría → Subcategoría → Material, o Procesado (kg)."
        action={<Button type="button" variant="outline" size="sm" onClick={agregarLinea}><Plus className="h-4 w-4 mr-1.5" /> Fila</Button>}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full text-sm min-w-[1330px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="font-medium py-2 pr-2">Empresa o persona</th>
                  <th className="font-medium py-2 px-2">Tipo</th>
                  <th className="font-medium py-2 px-2">Material</th>
                  <th className="font-medium py-2 px-2">Recepción</th>
                  <th className="font-medium py-2 px-2">Descripción</th>
                  <th className="font-medium py-2 px-2">Reparado por</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, idx) => (
                  <tr key={idx} className="border-b border-border/60">
                    <td className="py-1.5 pr-2 align-top">
                      <Input className="h-9" value={l.proveedor} onChange={(e) => actualizarLinea(idx, "proveedor", e.target.value)} placeholder="Nombre" />
                    </td>
                    <td className="py-1.5 px-2 align-top">
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={l.tipo_proveedor} onChange={(e) => actualizarLinea(idx, "tipo_proveedor", e.target.value)}>
                        <option value="empresa">Empresa</option>
                        <option value="persona_privada">Persona</option>
                      </select>
                    </td>
                    <td className="py-1.5 px-2 align-top min-w-[460px]">
                      <SelectorElectronico value={l} onChange={(patch) => actualizarSelector(idx, patch)} />
                    </td>
                    <td className="py-1.5 px-2 align-top">
                      <Input type="date" className="h-9" value={l.fecha_recepcion} onChange={(e) => actualizarLinea(idx, "fecha_recepcion", e.target.value)} />
                    </td>
                    <td className="py-1.5 px-2 align-top">
                      <Input className="h-9 min-w-[140px]" value={l.descripcion} onChange={(e) => actualizarLinea(idx, "descripcion", e.target.value)} placeholder="Opcional" />
                    </td>
                    <td className="py-1.5 px-2 align-top">
                      <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm min-w-[150px]" value={l.reparado_por} onChange={(e) => {
                        const est = estudiantes.find((s) => s.id === e.target.value);
                        actualizarLinea(idx, "reparado_por", e.target.value);
                        actualizarLinea(idx, "reparado_por_nombre", est ? (est.nombre_completo || est.full_name || "") : "");
                      }}>
                        <option value="">Sin asignar</option>
                        {estudiantes.map((s) => <option key={s.id} value={s.id}>{s.nombre_completo || s.full_name}</option>)}
                      </select>
                    </td>
                    <td className="py-1.5 pl-2 align-top">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => insertLinea(idx)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg" title="Agregar fila (misma empresa)"><Plus className="h-4 w-4" /></button>
                        <button type="button" onClick={() => quitarLinea(idx)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" variant="outline" onClick={agregarLinea} className="w-full border-dashed"><Plus className="h-4 w-4 mr-2" /> Agregar otra fila (misma empresa/persona)</Button>
          <Button type="submit" disabled={saving}><Plus className="h-4 w-4 mr-2" /> {saving ? "Guardando…" : `Registrar ${lineas.filter(filaValida).length} registro(s)`}</Button>
        </form>
      </SectionCard>

      {/* Listado */}
      <SectionCard title="Registros" subtitle={`${filtrados.length} registros`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 w-40" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todo tipo</option>
              <option value="articulo">Artículos (u)</option>
              <option value="procesado">Procesados (kg)</option>
            </select>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}>
              <option value="">Todas categorías</option>
              {CATEGORIAS_FLAT.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.medida === "kg" ? "kg" : "u"})</option>)}
            </select>
          </div>
        }
      >
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-7 h-7 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>
        ) : filtrados.length === 0 ? (
          <EmptyState title="Sin registros" message="Aún no se han registrado electrónicos." icon={Cpu} />
        ) : (
          <div className="space-y-2 max-h-[460px] overflow-y-auto scrollbar-thin pr-1">
            {filtrados.map((m) => {
              const med = medidaDe(m);
              const esProc = m.tipo_registro === "procesado";
              return (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><Cpu className="h-4 w-4" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm text-foreground truncate">{m.proveedor}</p>
                      <StatusBadge status={m.tipo_proveedor === "empresa" ? "aprobada" : "pendiente"} />
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${esProc ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{esProc ? "Procesado" : "Artículo"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatearFecha(m.fecha_recepcion)} · {labelCategoria(m.categoria)}{m.subcategoria ? ` · ${m.subcategoria}` : ""}{m.material ? ` · ${m.material}` : ""} · {m.cantidad || 0} {MEDIDA_LABEL[med]}
                    </p>
                    {m.descripcion && <p className="text-xs text-muted-foreground italic mt-1">{m.descripcion}</p>}
                    {m.reparado_por_nombre && <p className="text-xs text-primary font-medium mt-1">🔧 Reparado por {m.reparado_por_nombre}</p>}
                  </div>
                  <button onClick={() => handleDelete(m.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Resumen por categoría */}
      <SectionCard title="Resumen por categoría" icon={Cpu}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {CATEGORIAS_FLAT.map((c) => (
            <div key={c.value} className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="text-2xl font-bold font-heading text-primary">{porCategoria(c.value)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.label}</p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">{cantidadCategoria(c.value)} {c.medida === "kg" ? "kg" : "u"}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}