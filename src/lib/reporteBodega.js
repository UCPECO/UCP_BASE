import { jsPDF } from "jspdf";
import { formatearFecha } from "@/lib/ucpUtils";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export function generarReporteBodega({ titulo, registros, categorias, catMedida, catLabel, mes, anio }) {
  const doc = new jsPDF();
  const hoy = new Date();
  const nombreMes = MESES[mes];
  const medidaDe = (m) => m.medida || catMedida[m.categoria] || "unidades";
  const enMes = (r) => {
    const f = new Date(r.fecha_recepcion);
    return f.getMonth() === mes && f.getFullYear() === anio;
  };
  const regsMes = registros.filter(enMes);

  const pesoMes = regsMes.filter(m => medidaDe(m) === "kg").reduce((a, m) => a + (m.cantidad || 0), 0);
  const unidadesMes = regsMes.filter(m => medidaDe(m) === "unidades").reduce((a, m) => a + (m.cantidad || 0), 0);
  const pesoTotal = registros.filter(m => medidaDe(m) === "kg").reduce((a, m) => a + (m.cantidad || 0), 0);
  const unidadesTotal = registros.filter(m => medidaDe(m) === "unidades").reduce((a, m) => a + (m.cantidad || 0), 0);

  // Header
  doc.setFillColor(15, 96, 80);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18); doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, 14);
  doc.setFontSize(11); doc.setFont("helvetica", "normal");
  doc.text(`${nombreMes} ${anio}`, 14, 23);
  doc.text(`Generado: ${hoy.toLocaleDateString("es-MX")}`, 14, 28);

  doc.setTextColor(40, 40, 40);
  let y = 44;
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text(`Resumen — ${nombreMes} ${anio}`, 14, y); y += 6;
  doc.line(14, y - 2, 196, y - 2);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Materiales registrados en el mes: ${regsMes.length}`, 14, y); y += 6;
  doc.text(`Peso total (kg): ${Math.round(pesoMes * 100) / 100} kg`, 14, y); y += 6;
  doc.text(`Unidades totales: ${unidadesMes}`, 14, y); y += 10;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Totales acumulados", 14, y); y += 6;
  doc.line(14, y - 2, 196, y - 2);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Peso acumulado: ${Math.round(pesoTotal * 100) / 100} kg`, 14, y); y += 6;
  doc.text(`Unidades acumuladas: ${unidadesTotal}`, 14, y); y += 10;

  // Desglose por categoría (mes)
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Desglose por categoría (mes)", 14, y); y += 5;
  doc.line(14, y - 2, 196, y - 2); y += 4;
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Categoría", 14, y); doc.text("Registros", 110, y); doc.text("Total", 150, y); y += 5;
  doc.setFont("helvetica", "normal");
  categorias.forEach(c => {
    const rMes = regsMes.filter(m => m.categoria === c.value);
    if (rMes.length === 0) return;
    if (y > 270) { doc.addPage(); y = 20; }
    const tot = rMes.reduce((a, m) => a + (m.cantidad || 0), 0);
    doc.text(catLabel[c.value] || c.value, 14, y);
    doc.text(String(rMes.length), 110, y);
    doc.text(`${tot} ${catMedida[c.value] === "kg" ? "kg" : "u"}`, 150, y);
    y += 5;
  });

  // Detalle del mes
  y += 4;
  if (y > 260) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("Detalle de recepciones del mes", 14, y); y += 5;
  doc.line(14, y - 2, 196, y - 2); y += 4;
  doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("Fecha", 14, y); doc.text("Proveedor", 40, y); doc.text("Categoría", 100, y); doc.text("Cant.", 150, y); y += 5;
  doc.setFont("helvetica", "normal");
  if (regsMes.length === 0) { doc.text("Sin recepciones en este mes.", 14, y); y += 5; }
  regsMes.forEach(m => {
    if (y > 275) { doc.addPage(); y = 20; }
    doc.text(formatearFecha(m.fecha_recepcion), 14, y);
    doc.text((m.proveedor || "—").slice(0, 28), 40, y);
    doc.text((catLabel[m.categoria] || m.categoria || "—").slice(0, 22), 100, y);
    doc.text(`${m.cantidad || 0} ${medidaDe(m) === "kg" ? "kg" : "u"}`, 150, y);
    y += 5;
  });

  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150, 150, 150);
    doc.text("Unidos Cuidando el Planeta · Bodega · Documento generado automáticamente", 14, 290);
  }
  doc.save(`${titulo.replace(/\s+/g, "_")}_${nombreMes}_${anio}.pdf`);
}