import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { BadgeDollarSign, Plus, Trash2, Search, Download, Loader2, ShoppingCart } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import KpiCard from "@/components/ucp/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { CATEGORIAS_FLAT_BODEGA, CAT_LABEL_BODEGA, CAT_MEDIDA_BODEGA, MEDIDA_LABEL } from "@/lib/catalogoBodega";
import { registrarBitacora } from "@/lib/bitacora";

const fmtDinero = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

const nuevaVenta = () => ({
  fecha: new Date().toISOString().split("T")[0],
  categoria: "",
  material: "",
  cantidad: 1,
  precio_unitario: "",
  comprador: "",
  notas: "",
});

export default function AdminVentas() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [ventas, setVentas] = useState([]);
  const [materiales, setMateriales] = useState([]);
  const [electronicos, setElectronicos] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(nuevaVenta());
  const [busqueda, setBusqueda] = useState("");
  const [mesFiltro, setMesFiltro] = useState("");

  const cargar = async () => {
    setLoading(true);
    try {
      const [v, m, e, s] = await Promise.all([
        base44.entities.Ventas.list("-fecha", 500),
        base44.entities.Materiales_Recibidos.list("-fecha_recepcion", 500),
        base44.entities.Electronicos_Reciclados.list("-fecha_recepcion", 500),
        base44.entities.Salidas_Materiales.list("-fecha", 500),
      ]);
      setVentas(v);
      setMateriales(m);
      setElectronicos(e);
      setSalidas(s);
    } catch (e) {
      toast({ title: "Error al cargar ventas", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Stock disponible por categoría (entradas - salidas)
  const stockPorCat = useMemo(() => {
    const mapa = {};
    const add = (cat, cant) => { if (cat) mapa[cat] = (mapa[cat] || 0) + (Number(cant) || 0); };
    materiales.forEach((m) => add(m.categoria, m.cantidad));
    electronicos.forEach((m) => add(m.categoria, m.cantidad));
    salidas.forEach((s) => add(s.categoria, -(Number(s.cantidad) || 0)));
    return mapa;
  }, [materiales, electronicos, salidas]);

  const medidaForm = CAT_MEDIDA_BODEGA[form.categoria] || "unidades";
  const stockSel = form.categoria ? (stockPorCat[form.categoria] || 0) : null;
  const totalForm = Math.round((Number(form.cantidad) || 0) * (Number(form.precio_unitario) || 0) * 100) / 100;

  const mesActual = new Date().toISOString().slice(0, 7);
  const ventasDelMes = ventas.filter((v) => (v.fecha || "").startsWith(mesActual));
  const ingresosMes = ventasDelMes.reduce((a, v) => a + (v.total || 0), 0);
  const ingresosTotales = ventas.reduce((a, v) => a + (v.total || 0), 0);

  const filtradas = ventas.filter((v) => {
    const txt = `${v.comprador || ""} ${v.material || ""} ${CAT_LABEL_BODEGA[v.categoria] || v.categoria || ""} ${v.notas || ""}`.toLowerCase();
    return txt.includes(busqueda.toLowerCase()) && (!mesFiltro || (v.fecha || "").startsWith(mesFiltro));
  });

  const guardar = async () => {
    if (!form.categoria || !form.cantidad || !form.precio_unitario) {
      toast({ title: "Completa categoría, cantidad y precio", variant: "destructive" });
      return;
    }
    if (medidaForm === "unidades" && Number(form.cantidad) > (stockSel ?? Infinity)) {
      toast({ title: `Stock insuficiente: solo hay ${stockSel} u disponibles`, variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      // 1) La venta descuenta del inventario como una salida con motivo "Venta"
      const salida = await base44.entities.Salidas_Materiales.create({
        categoria: form.categoria,
        medida: medidaForm,
        cantidad: Number(form.cantidad),
        motivo: `Venta${form.comprador ? ` a ${form.comprador}` : ""}`,
        retirado_por: form.comprador || "Venta",
        registrado_por: user.id,
        registrado_por_nombre: nombreUsuario(user),
        fecha: form.fecha,
      });
      // 2) Se registra la venta ligada a esa salida (al borrarla, el stock regresa)
      await base44.entities.Ventas.create({
        ...form,
        cantidad: Number(form.cantidad),
        medida: medidaForm,
        precio_unitario: Number(form.precio_unitario),
        total: totalForm,
        salida: salida?.id || null,
        registrado_por: user.id,
        registrado_por_nombre: nombreUsuario(user),
      });
      await registrarBitacora("Registrar venta", "Ventas", `${CAT_LABEL_BODEGA[form.categoria] || form.categoria} · ${form.cantidad} ${MEDIDA_LABEL[medidaForm]} · ${fmtDinero(totalForm)}`);
      toast({ title: "Venta registrada", description: `Total: ${fmtDinero(totalForm)} · stock actualizado` });
      setDialog(false);
      setForm(nuevaVenta());
      cargar();
    } catch (e) {
      toast({ title: "Error al registrar la venta", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (v) => {
    if (!confirm(`¿Eliminar la venta de ${CAT_LABEL_BODEGA[v.categoria] || v.categoria} (${fmtDinero(v.total)})? El stock regresará al inventario.`)) return;
    try {
      await base44.entities.Ventas.delete(v.id);
      toast({ title: "Venta eliminada", description: "El stock fue devuelto al inventario." });
      cargar();
    } catch (e) {
      toast({ title: "Error al eliminar", description: e.message, variant: "destructive" });
    }
  };

  const exportarCSV = () => {
    const rows = [["Fecha", "Categoría", "Material", "Cantidad", "Medida", "Precio unitario", "Total", "Comprador", "Registrado por", "Notas"]];
    filtradas.forEach((v) => rows.push([
      v.fecha, CAT_LABEL_BODEGA[v.categoria] || v.categoria, v.material || "", v.cantidad, v.medida,
      v.precio_unitario, v.total, v.comprador || "", v.registrado_por_nombre || "", (v.notas || "").replace(/[\n,]/g, " "),
    ]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `ventas_${mesFiltro || "todas"}.csv`; a.click();
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-700 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
            <BadgeDollarSign className="h-7 w-7 text-primary" /> Ventas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Venta de materiales y electrónicos reciclados. Cada venta descuenta el inventario automáticamente.</p>
        </div>
        <Button onClick={() => setDialog(true)}><Plus className="h-4 w-4 mr-2" /> Nueva venta</Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={ShoppingCart} label="Ventas del mes" value={ventasDelMes.length} tone="primary" />
        <KpiCard icon={BadgeDollarSign} label="Ingresos del mes" value={fmtDinero(ingresosMes)} tone="accent" />
        <KpiCard icon={BadgeDollarSign} label="Ingresos totales" value={fmtDinero(ingresosTotales)} tone="blue" />
        <KpiCard icon={ShoppingCart} label="Ventas totales" value={ventas.length} tone="rose" />
      </div>

      <SectionCard title="Historial de ventas" subtitle={`${filtradas.length} venta(s)`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 w-44" placeholder="Buscar…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <Input type="month" className="w-40" value={mesFiltro} onChange={(e) => setMesFiltro(e.target.value)} />
            <Button variant="outline" size="sm" onClick={exportarCSV}><Download className="h-4 w-4 mr-1.5" /> CSV</Button>
          </div>
        }
      >
        {filtradas.length === 0 ? (
          <EmptyState title="Sin ventas" message="Registra la primera venta con el botón de arriba." icon={BadgeDollarSign} />
        ) : (
          <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
            {filtradas.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><BadgeDollarSign className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {CAT_LABEL_BODEGA[v.categoria] || v.categoria}{v.material ? ` · ${v.material}` : ""} · {v.cantidad} {MEDIDA_LABEL[v.medida] || "u"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatearFecha(v.fecha)}{v.comprador ? ` · ${v.comprador}` : ""} · {v.registrado_por_nombre || "—"}
                  </p>
                  {v.notas && <p className="text-xs text-muted-foreground italic truncate">{v.notas}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm">{fmtDinero(v.total)}</p>
                  <p className="text-[11px] text-muted-foreground">{fmtDinero(v.precio_unitario)} c/u</p>
                </div>
                <button onClick={() => eliminar(v)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0" title="Eliminar (devuelve stock)"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Dialog nueva venta */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva venta</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Categoría *</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                <option value="">Selecciona…</option>
                {CATEGORIAS_FLAT_BODEGA.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} ({MEDIDA_LABEL[c.medida]}){stockPorCat[c.value] != null ? ` — stock: ${stockPorCat[c.value]}` : ""}
                  </option>
                ))}
              </select>
              {form.categoria && (
                <p className={`text-xs ${stockSel <= 0 ? "text-rose-600 font-medium" : "text-muted-foreground"}`}>
                  Stock disponible: {stockSel ?? 0} {MEDIDA_LABEL[medidaForm]}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Material / descripción</Label>
              <Input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} placeholder="Ej. Laptop HP reparada" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cantidad ({MEDIDA_LABEL[medidaForm]}) *</Label>
                <Input type="number" min={medidaForm === "kg" ? "0.1" : "1"} step={medidaForm === "kg" ? "0.1" : "1"} value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Precio por {medidaForm === "kg" ? "kg" : "unidad"} *</Label>
                <Input type="number" min="0" step="0.01" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Comprador</Label>
                <Input value={form.comprador} onChange={(e) => setForm({ ...form, comprador: e.target.value })} placeholder="Nombre (opcional)" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Opcional" />
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
              <p className="text-xs text-emerald-700">Total de la venta</p>
              <p className="text-2xl font-bold text-emerald-800">{fmtDinero(totalForm)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Registrar venta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
