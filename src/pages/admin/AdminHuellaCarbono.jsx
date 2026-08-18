import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Leaf, FileDown, Trash2, Loader2, FileBadge, Calculator } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import KpiCard from "@/components/ucp/KpiCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { formatearFecha, nombreUsuario } from "@/lib/ucpUtils";
import { calcularHuella, generarPdfHuella } from "@/lib/huellaCarbono";
import { registrarBitacora } from "@/lib/bitacora";

function inicioDeMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function hoyISO() {
  return new Date().toISOString().split("T")[0];
}

export default function AdminHuellaCarbono() {
  const { toast } = useToast();
  const [perfil, setPerfil] = useState(null);
  const [materiales, setMateriales] = useState([]);
  const [electronicos, setElectronicos] = useState([]);
  const [reportes, setReportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(inicioDeMes());
  const [hasta, setHasta] = useState(hoyISO());
  const [generando, setGenerando] = useState(false);
  const [descargandoId, setDescargandoId] = useState(null);
  const [errorReportes, setErrorReportes] = useState(false);

  const esAdmin = perfil?.role === "admin";

  const cargar = async () => {
    // Cada consulta es independiente: si una falla (ej. el servidor aún no
    // tiene la tabla de reportes), el resto de la página sigue funcionando.
    const [me, mat, elec, reps] = await Promise.allSettled([
      base44.auth.me(),
      base44.entities.Materiales_Recibidos.list("-fecha_recepcion", 1000),
      base44.entities.Electronicos_Reciclados.list("-fecha_recepcion", 1000),
      base44.entities.Reportes_Huella.list("-created_date", 200),
    ]);
    if (me.status === "fulfilled") setPerfil(me.value);
    if (mat.status === "fulfilled") setMateriales(mat.value || []);
    if (elec.status === "fulfilled") setElectronicos(elec.value || []);
    if (reps.status === "fulfilled") {
      setReportes(reps.value || []);
    } else {
      console.warn("Reportes_Huella no disponible aún:", reps.reason);
      setErrorReportes(true);
    }
    if (mat.status === "rejected" && elec.status === "rejected") {
      toast({ title: "Error al cargar datos", description: "No se pudieron cargar las recepciones de material.", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const enRango = (f) => f && f >= desde && f <= hasta;

  const calculo = useMemo(() => {
    const mat = materiales.filter((m) => enRango((m.fecha_recepcion || "").slice(0, 10)));
    const elec = electronicos.filter((m) => enRango((m.fecha_recepcion || "").slice(0, 10)));
    return calcularHuella(mat, elec);
  }, [materiales, electronicos, desde, hasta]);

  const recepciones = useMemo(() =>
    materiales.filter((m) => enRango((m.fecha_recepcion || "").slice(0, 10))).length +
    electronicos.filter((m) => enRango((m.fecha_recepcion || "").slice(0, 10))).length
  , [materiales, electronicos, desde, hasta]);

  const generarDocumento = async () => {
    if (calculo.desglose.length === 0) {
      toast({ title: "Sin recepciones en el periodo", description: "Ajusta las fechas o registra entradas de material primero.", variant: "destructive" });
      return;
    }
    setGenerando(true);
    try {
      const creado = await base44.entities.Reportes_Huella.create({
        periodo_inicio: desde,
        periodo_fin: hasta,
        desglose: JSON.stringify(calculo.desglose),
        total_kg: calculo.total_kg,
        total_unidades: calculo.total_unidades,
        total_co2e: calculo.total_co2e,
        generado_por: perfil.id,
        generado_por_nombre: nombreUsuario(perfil),
      });
      await registrarBitacora("Generar reporte de huella de carbono", "Inventario", `Folio ${creado.folio} (${desde} a ${hasta})`);
      await generarPdfHuella(creado);
      toast({ title: "Documento generado", description: `Folio ${creado.folio}` });
      cargar();
    } catch (e) {
      console.error(e);
      toast({ title: "Error al generar el documento", variant: "destructive" });
    } finally {
      setGenerando(false);
    }
  };

  const descargar = async (r) => {
    setDescargandoId(r.id);
    try { await generarPdfHuella(r); }
    catch (e) { toast({ title: "Error al generar el PDF", variant: "destructive" }); }
    finally { setDescargandoId(null); }
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar el documento ${r.folio}? El cálculo se puede volver a generar, pero el folio se pierde.`)) return;
    try {
      await base44.entities.Reportes_Huella.delete(r.id);
      toast({ title: "Documento eliminado", description: r.folio });
      cargar();
    } catch (e) { toast({ title: "Error al eliminar", variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>;

  return (
    <div className="space-y-6">
      {/* Calculadora por periodo */}
      <SectionCard title="Calcular huella de carbono" subtitle="Suma todas las recepciones de material (bodega + electrónicos) dentro del periodo" icon={Calculator}>
        <div className="flex flex-wrap items-end gap-3 mb-5">
          <div className="space-y-1 flex-1 min-w-[140px] sm:flex-none">
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 w-full sm:w-40" />
          </div>
          <div className="space-y-1 flex-1 min-w-[140px] sm:flex-none">
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 w-full sm:w-40" />
          </div>
          <Button onClick={generarDocumento} disabled={generando || calculo.desglose.length === 0} className="w-full sm:w-auto">
            {generando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            {generando ? "Generando..." : "Generar documento PDF"}
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <KpiCard icon={Leaf} label="CO₂e evitado" value={`${calculo.total_co2e.toLocaleString("es-MX")} kg`} tone="primary" />
          <KpiCard icon={Calculator} label="Material recibido" value={`${calculo.total_kg.toLocaleString("es-MX")} kg`} tone="accent" />
          <KpiCard icon={FileBadge} label="Recepciones" value={recepciones} tone="blue" />
          <KpiCard icon={Leaf} label="Equiv. árboles/año" value={Math.round(calculo.total_co2e / 21).toLocaleString("es-MX")} tone="slate" />
        </div>

        {calculo.desglose.length === 0 ? (
          <EmptyState title="Sin recepciones" message="No hay entradas de material en este periodo." icon={Leaf} />
        ) : (
          <>
            {/* Móvil: tarjetas apiladas */}
            <div className="space-y-2 sm:hidden">
              {calculo.desglose.map((d) => (
                <div key={d.categoria} className="p-3 rounded-lg border border-border">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{d.label}</p>
                    <p className="font-semibold text-primary text-sm whitespace-nowrap">{d.co2e.toLocaleString("es-MX")} kg</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.cantidad} {d.medida === "kg" ? "kg" : "u"} · peso est. {d.kg_estimados.toLocaleString("es-MX")} kg · factor {d.factor}
                  </p>
                </div>
              ))}
            </div>
            {/* Escritorio: tabla */}
            <div className="overflow-x-auto scrollbar-thin hidden sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase border-b border-border">
                    <th className="py-2 pr-4 font-medium">Categoría</th>
                    <th className="py-2 px-3 font-medium text-right">Cantidad</th>
                    <th className="py-2 px-3 font-medium text-right">Peso est.</th>
                    <th className="py-2 px-3 font-medium text-right">Factor</th>
                    <th className="py-2 pl-3 font-medium text-right">CO₂e evitado</th>
                  </tr>
                </thead>
                <tbody>
                  {calculo.desglose.map((d) => (
                    <tr key={d.categoria} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium">{d.label} <span className="text-xs text-muted-foreground">({d.medida === "kg" ? "kg" : "unidades"})</span></td>
                      <td className="py-2.5 px-3 text-right">{d.cantidad}</td>
                      <td className="py-2.5 px-3 text-right">{d.kg_estimados.toLocaleString("es-MX")} kg</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">{d.factor}</td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-primary">{d.co2e.toLocaleString("es-MX")} kg</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      {/* Documentos generados */}
      <SectionCard title="Documentos generados" subtitle={`${reportes.length} reporte(s) con folio`} icon={FileBadge}>
        {errorReportes && (
          <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-800 text-sm">
            El servidor aún no tiene activada la sección de documentos. Reinicia la aplicación Node.js en el panel de Hostinger para cargar el código nuevo.
          </div>
        )}
        {reportes.length === 0 && !errorReportes ? (
          <EmptyState title="Sin documentos" message="Genera el primer reporte con el botón de arriba." icon={FileBadge} />
        ) : (
          <div className="space-y-2">
            {reportes.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border flex-wrap">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Leaf className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{r.folio}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatearFecha(r.periodo_inicio)} — {formatearFecha(r.periodo_fin)} · {(r.total_co2e || 0).toLocaleString("es-MX")} kg CO₂e · {r.generado_por_nombre || "—"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => descargar(r)} disabled={descargandoId === r.id}>
                    {descargandoId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1" />} PDF
                  </Button>
                  {esAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => eliminar(r)} className="text-rose-600" title="Eliminar documento">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
