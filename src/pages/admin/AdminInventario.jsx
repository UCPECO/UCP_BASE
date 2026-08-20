import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Package, Loader2, Plus, AlertTriangle, ArrowDownRight, Settings, Cpu, Warehouse, Leaf, Tags, Trash2 } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import KpiCard from "@/components/ucp/KpiCard";
import AdminMateriales from "@/pages/admin/AdminMateriales";
import AdminElectronicos from "@/pages/admin/AdminElectronicos";
import AdminHuellaCarbono from "@/pages/admin/AdminHuellaCarbono";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { CATEGORIAS_FLAT_BODEGA, CAT_LABEL_BODEGA, MEDIDA_LABEL } from "@/lib/catalogoBodega";
import { esAreaBodega } from "@/lib/areas";
import { useCategoriasCustom, fusionarFlat, invalidarCategoriasCustom, obtenerCategoriasCustom } from "@/lib/categoriasDinamicas";
import { registrarBitacora } from "@/lib/bitacora";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const TABS = [
  { id: "stock", label: "Stock y salidas", icon: Package },
  { id: "bodega", label: "Entradas de bodega", icon: Warehouse },
  { id: "electronicos", label: "Electrónicos reciclados", icon: Cpu },
  { id: "huella", label: "Huella de carbono", icon: Leaf },
  { id: "categorias", label: "Categorías", icon: Tags, soloAdmin: true },
];

export default function AdminInventario() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "stock";
  const setTab = (id) => setSearchParams(id === "stock" ? {} : { tab: id });

  const [perfil, setPerfil] = useState(null);
  const [materiales, setMateriales] = useState([]);
  const [electronicos, setElectronicos] = useState([]);
  const [salidas, setSalidas] = useState([]);
  const [stocksMin, setStocksMin] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogSalida, setDialogSalida] = useState(false);
  const [dialogMin, setDialogMin] = useState(false);
  const [formSalida, setFormSalida] = useState({ categoria: "", cantidad: 1, area: "", motivo: "", retirado_por: "" });
  const [formMin, setFormMin] = useState({ categoria: "", cantidad_minima: 0 });
  const [guardando, setGuardando] = useState(false);

  const esAdmin = perfil?.role === "admin";
  // Personal de bodega (Bodega/CU1/CU2): solo entradas; salidas y ventas son del admin
  const esEncargadoBodega = perfil?.role === "encargado" && esAreaBodega(perfil?.area_encargada);

  // Categorías = catálogo base + personalizadas creadas por el admin
  const [customCats, setCustomCats] = useState([]);
  const cargarCats = async () => {
    invalidarCategoriasCustom();
    setCustomCats(await obtenerCategoriasCustom());
  };
  useEffect(() => { obtenerCategoriasCustom().then(setCatsCustom); }, []);
  const catsFlat = fusionarFlat(CATEGORIAS_FLAT_BODEGA, customCats);
  const labelDe = (cat) => catsFlat.find((c) => c.value === cat)?.label || CAT_LABEL_BODEGA[cat] || cat;
  const medidaDeCat = (cat) => catsFlat.find((c) => c.value === cat)?.medida || "unidades";

  // Nueva categoría personalizada (tab Categorías, solo admin)
  const [nuevaCat, setNuevaCat] = useState({ nombre: "", medida: "unidades" });
  const [guardandoCat, setGuardandoCat] = useState(false);
  const crearCategoria = async () => {
    const nombre = nuevaCat.nombre.trim();
    if (!nombre) return;
    if (catsFlat.some((c) => c.value.toLowerCase() === nombre.toLowerCase())) {
      toast({ title: "Esa categoría ya existe", variant: "destructive" });
      return;
    }
    setGuardandoCat(true);
    try {
      await base44.entities.Categorias_Material.create({ nombre, medida: nuevaCat.medida, activa: true, creado_por: perfil.id });
      await registrarBitacora("Crear categoría de material", "Inventario", `${nombre} (${nuevaCat.medida})`);
      toast({ title: "Categoría creada", description: `${nombre} · ya aparece en los formularios de entrada` });
      setNuevaCat({ nombre: "", medida: "unidades" });
      cargarCats();
    } catch (e) { toast({ title: "Error al crear", description: e.message, variant: "destructive" }); }
    finally { setGuardandoCat(false); }
  };
  const desactivarCategoria = async (c) => {
    if (!confirm(`¿Quitar la categoría "${c.nombre}" de los formularios? Los registros que ya la usan no se borran.`)) return;
    try {
      await base44.entities.Categorias_Material.update(c.id, { activa: 0 });
      toast({ title: "Categoría desactivada", description: c.nombre });
      cargarCats();
    } catch (e) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  useEffect(() => {
    base44.auth.me().then(setPerfil).catch(() => {});
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const [mat, elec, sal, mins] = await Promise.all([
        base44.entities.Materiales_Recibidos.list("-fecha_recepcion", 500),
        base44.entities.Electronicos_Reciclados.list("-fecha_recepcion", 500),
        base44.entities.Salidas_Materiales.list("-fecha", 500),
        base44.entities.Stock_Minimo.list("-created_date", 200),
      ]);
      setMateriales(mat);
      setElectronicos(elec);
      setSalidas(sal);
      setStocksMin(mins);
    } catch (e) {
      toast({ title: "Error al cargar inventario", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Stock actual por categoría = entradas (bodega + electrónicos) - salidas
  const stockPorCat = useMemo(() => {
    const mapa = {};
    const add = (cat, cant, medida) => {
      if (!cat) return;
      if (!mapa[cat]) mapa[cat] = { entradas: 0, salidas: 0, medida: medida || "unidades" };
      mapa[cat].entradas += Number(cant) || 0;
    };
    materiales.forEach((m) => add(m.categoria, m.cantidad, m.medida));
    electronicos.forEach((m) => add(m.categoria, m.cantidad, m.medida));
    salidas.forEach((s) => {
      if (!s.categoria) return;
      if (!mapa[s.categoria]) mapa[s.categoria] = { entradas: 0, salidas: 0, medida: s.medida || "unidades" };
      mapa[s.categoria].salidas += Number(s.cantidad) || 0;
    });
    return mapa;
  }, [materiales, electronicos, salidas]);

  const minDe = (cat) => stocksMin.find((s) => s.categoria === cat)?.cantidad_minima || 0;
  const stockActual = (cat) => (stockPorCat[cat] ? stockPorCat[cat].entradas - stockPorCat[cat].salidas : 0);

  const alertas = CATEGORIAS_FLAT_BODEGA.filter((c) => stockActual(c.value) < minDe(c.value) && minDe(c.value) > 0);

  const registrarSalida = async () => {
    if (!formSalida.categoria || !formSalida.cantidad) {
      toast({ title: "Completa categoría y cantidad", variant: "destructive" });
      return;
    }
    setGuardando(true);
    try {
      const cat = catsFlat.find((c) => c.value === formSalida.categoria);
      await base44.entities.Salidas_Materiales.create({
        categoria: formSalida.categoria,
        medida: cat?.medida || "unidades",
        cantidad: Number(formSalida.cantidad) || 1,
        area: formSalida.area,
        motivo: formSalida.motivo,
        retirado_por: formSalida.retirado_por,
        registrado_por: perfil.id,
        registrado_por_nombre: nombreUsuario(perfil),
        fecha: new Date().toISOString().split("T")[0],
      });
      await registrarBitacora("Registrar salida de material", "Inventario", formSalida.categoria + " (" + formSalida.cantidad + ")");
      toast({ title: "Salida registrada" });
      setDialogSalida(false);
      setFormSalida({ categoria: "", cantidad: 1, area: "", motivo: "", retirado_por: "" });
      cargar();
    } catch (e) {
      toast({ title: "Error al registrar", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const guardarMinimo = async () => {
    if (!formMin.categoria) return;
    setGuardando(true);
    try {
      const existente = stocksMin.find((s) => s.categoria === formMin.categoria);
      if (existente) {
        await base44.entities.Stock_Minimo.update(existente.id, { cantidad_minima: Number(formMin.cantidad_minima) || 0 });
      } else {
        const cat = catsFlat.find((c) => c.value === formMin.categoria);
        await base44.entities.Stock_Minimo.create({
          categoria: formMin.categoria,
          medida: cat?.medida || "unidades",
          cantidad_minima: Number(formMin.cantidad_minima) || 0,
          configurado_por: perfil.id,
        });
      }
      await registrarBitacora("Configurar stock mínimo", "Inventario", formMin.categoria + " → " + formMin.cantidad_minima);
      toast({ title: "Stock mínimo guardado" });
      setDialogMin(false);
      setFormMin({ categoria: "", cantidad_minima: 0 });
      cargar();
    } catch (e) {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <Package className="h-7 w-7 text-primary" /> Inventario y Bodega
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Todo el inventario en un solo lugar: stock, entradas de materiales y electrónicos.</p>
      </div>

      {/* Tabs internos */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.filter((t) => !t.soloAdmin || esAdmin).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <div className="space-y-6">
          <div className="flex gap-2 justify-end flex-wrap">
            {esAdmin && (
              <Button variant="outline" onClick={() => setDialogMin(true)}><Settings className="h-4 w-4 mr-2" /> Stock mínimo</Button>
            )}
            {!esEncargadoBodega && (
              <Button onClick={() => setDialogSalida(true)} className="bg-primary text-primary-foreground"><ArrowDownRight className="h-4 w-4 mr-2" /> Registrar salida</Button>
            )}
            {esEncargadoBodega && (
              <p className="text-xs text-muted-foreground self-center">Tu área registra solo entradas de material. Las salidas las hace el administrador.</p>
            )}
          </div>

          {alertas.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
                <AlertTriangle className="h-4 w-4" /> {alertas.length} alerta(s) de stock bajo
              </div>
              <div className="flex flex-wrap gap-2">
                {alertas.map((c) => (
                  <span key={c.value} className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                    {c.label}: {stockActual(c.value)} {MEDIDA_LABEL[c.medida] || "u"} (mín. {minDe(c.value)})
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Package} label="Categorías" value={Object.keys(stockPorCat).length} tone="primary" />
            <KpiCard icon={ArrowDownRight} label="Salidas registradas" value={salidas.length} tone="blue" />
            <KpiCard icon={AlertTriangle} label="Alertas" value={alertas.length} tone="rose" />
            <KpiCard icon={Settings} label="Mínimos config." value={stocksMin.length} tone="accent" />
          </div>

          <SectionCard title="Stock actual por categoría" subtitle="Entradas (bodega + electrónicos) menos salidas">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
            ) : Object.keys(stockPorCat).length === 0 ? (
              <EmptyState title="Sin movimientos" message="Registra materiales en las pestañas de entradas para ver el stock." icon={Package} />
            ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground uppercase border-b border-border">
                      <th className="py-2 pr-4 font-medium">Categoría</th>
                      <th className="py-2 px-4 font-medium">Entradas</th>
                      <th className="py-2 px-4 font-medium">Salidas</th>
                      <th className="py-2 px-4 font-medium">Stock actual</th>
                      <th className="py-2 pl-4 font-medium">Mínimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stockPorCat).map(([cat, v]) => {
                      const actual = v.entradas - v.salidas;
                      const min = minDe(cat);
                      const bajo = min > 0 && actual < min;
                      return (
                        <tr key={cat} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 pr-4 font-medium">{CAT_LABEL_BODEGA[cat] || cat}</td>
                          <td className="py-2.5 px-4">{v.entradas} {MEDIDA_LABEL[v.medida] || "u"}</td>
                          <td className="py-2.5 px-4 text-rose-600">{v.salidas} {MEDIDA_LABEL[v.medida] || "u"}</td>
                          <td className={"py-2.5 px-4 font-semibold " + (bajo ? "text-rose-600" : "text-primary")}>{actual} {MEDIDA_LABEL[v.medida] || "u"}</td>
                          <td className="py-2.5 pl-4 text-muted-foreground">{min > 0 ? min + " " + (MEDIDA_LABEL[v.medida] || "u") : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Movimientos recientes (salidas)" subtitle={salidas.length + " registros"}>
            {salidas.length === 0 ? (
              <EmptyState title="Sin salidas" message="Registra una salida de material con el botón de arriba." icon={ArrowDownRight} />
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
                {salidas.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/40">
                    <div className="h-8 w-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0"><ArrowDownRight className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{CAT_LABEL_BODEGA[s.categoria] || s.categoria} · {s.cantidad} {MEDIDA_LABEL[s.medida] || "u"}</p>
                      <p className="text-xs text-muted-foreground">{formatearFecha(s.fecha)} · {s.registrado_por_nombre || "—"} {s.area ? "· " + s.area : ""} {s.motivo ? "· " + s.motivo : ""}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {tab === "bodega" && <AdminMateriales embedded />}
      {tab === "electronicos" && <AdminElectronicos embedded />}
      {tab === "huella" && <AdminHuellaCarbono />}

      {tab === "categorias" && esAdmin && (
        <div className="space-y-6">
          <SectionCard title="Nueva categoría personalizada" subtitle="Aparece en los formularios de entradas, stock, ventas y huella de carbono" icon={Tags}>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label>Nombre de la categoría *</Label>
                <Input value={nuevaCat.nombre} onChange={(e) => setNuevaCat({ ...nuevaCat, nombre: e.target.value })} placeholder="Ej. Ropa y textiles" />
              </div>
              <div className="space-y-1.5">
                <Label>Se mide en</Label>
                <select className="h-9 w-full sm:w-40 rounded-md border border-input bg-background px-3 text-sm" value={nuevaCat.medida} onChange={(e) => setNuevaCat({ ...nuevaCat, medida: e.target.value })}>
                  <option value="unidades">Unidades</option>
                  <option value="kg">Kilogramos</option>
                </select>
              </div>
              <Button onClick={crearCategoria} disabled={guardandoCat || !nuevaCat.nombre.trim()}>
                {guardandoCat ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Crear categoría
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Categorías activas" subtitle={`${catsFlat.length} en total · las base no se pueden quitar`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {catsFlat.map((c) => {
                const esCustom = customCats.some((x) => x.nombre === c.value);
                const customObj = customCats.find((x) => x.nombre === c.value);
                return (
                  <div key={c.value} className="flex items-center justify-between gap-2 p-3 rounded-lg border border-border bg-secondary/40">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{MEDIDA_LABEL[c.medida] || c.medida} · {esCustom ? "personalizada" : "catálogo base"}</p>
                    </div>
                    {esCustom && (
                      <button onClick={() => desactivarCategoria(customObj)} className="p-1.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 rounded-lg shrink-0" title="Quitar de los formularios">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {/* Dialog salida */}
      <Dialog open={dialogSalida} onOpenChange={setDialogSalida}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar salida de material</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Categoría/Material</Label>
              <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={formSalida.categoria} onChange={(e) => setFormSalida({ ...formSalida, categoria: e.target.value })}>
                <option value="">Selecciona...</option>
                {catsFlat.map((c) => <option key={c.value} value={c.value}>{c.label} ({MEDIDA_LABEL[c.medida]})</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input type="number" value={formSalida.cantidad} onChange={(e) => setFormSalida({ ...formSalida, cantidad: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Área destino</Label>
                <Input value={formSalida.area} onChange={(e) => setFormSalida({ ...formSalida, area: e.target.value })} placeholder="Opcional" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Retirado por</Label>
              <Input value={formSalida.retirado_por} onChange={(e) => setFormSalida({ ...formSalida, retirado_por: e.target.value })} placeholder="Nombre (opcional)" />
            </div>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Input value={formSalida.motivo} onChange={(e) => setFormSalida({ ...formSalida, motivo: e.target.value })} placeholder="Ej. Reparación de equipo" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogSalida(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={registrarSalida} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />} Registrar salida</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog stock mínimo (admin) */}
      {esAdmin && (
        <Dialog open={dialogMin} onOpenChange={setDialogMin}>
          <DialogContent>
            <DialogHeader><DialogTitle>Configurar stock mínimo</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={formMin.categoria} onChange={(e) => setFormMin({ ...formMin, categoria: e.target.value })}>
                  <option value="">Selecciona...</option>
                  {catsFlat.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad mínima</Label>
                <Input type="number" value={formMin.cantidad_minima} onChange={(e) => setFormMin({ ...formMin, cantidad_minima: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogMin(false)} disabled={guardando}>Cancelar</Button>
              <Button onClick={guardarMinimo} disabled={guardando}>{guardando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
