import { jsPDF } from "jspdf";
import { formatearFecha } from "@/lib/ucpUtils";
import { textoEnvuelto } from "@/lib/pdfUtils";

export function generarReportePdfMensual({ perfil, actividad, registros, bonos, mes, anio }) {
  const META = actividad?.meta_horas || 480;
  const doc = new jsPDF();
  const hoy = new Date();
  const nombreMes = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][mes];

  // Filtrar registros del mes
  const regsMes = registros.filter(r => {
    const f = new Date(r.fecha);
    return f.getMonth() === mes && f.getFullYear() === anio && r.estado_registro === "cerrado";
  });
  const bonosMes = bonos.filter(b => {
    const f = new Date(b.fecha);
    return f.getMonth() === mes && f.getFullYear() === anio;
  });

  const horasMes = regsMes.reduce((acc, r) => {
    const [h1, m1] = (r.hora_entrada || "0:0").split(":").map(Number);
    const [h2, m2] = (r.hora_salida || "0:0").split(":").map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    return acc + mins / 60;
  }, 0);
  const horasBonoMes = bonosMes.reduce((acc, b) => acc + (b.horas || 0), 0);
  const totalMes = Math.round((horasMes + horasBonoMes) * 100) / 100;

  // Total acumulado histórico
  const horasTotalReg = registros.filter(r => r.estado_registro === "cerrado").reduce((acc, r) => {
    const [h1, m1] = (r.hora_entrada || "0:0").split(":").map(Number);
    const [h2, m2] = (r.hora_salida || "0:0").split(":").map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    return acc + mins / 60;
  }, 0);
  const horasTotalBono = bonos.reduce((acc, b) => acc + (b.horas || 0), 0);
  const totalAcumulado = Math.round((horasTotalReg + horasTotalBono) * 100) / 100;
  const porcentaje = Math.min(100, Math.round((totalAcumulado / META) * 100));

  // Header
  doc.setFillColor(15, 96, 80); // emerald-700
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Unidos Cuidando el Planeta · Reporte de Servicio Social", 14, 14);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${nombreMes} ${anio}`, 14, 23);
  doc.text(`Generado: ${hoy.toLocaleDateString("es-MX")}`, 14, 28);

  // Datos del alumno
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Datos del alumno", 14, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 50;
  y = textoEnvuelto(doc, `Nombre: ${perfil?.nombre_completo || perfil?.full_name || "—"}`, 14, y, 182, 6);
  y = textoEnvuelto(doc, `Correo: ${perfil?.email || "—"}`, 14, y, 182, 6);
  y = textoEnvuelto(doc, `Matrícula: ${perfil?.matricula || "—"}    Carrera: ${perfil?.carrera || "—"}`, 14, y, 182, 6);
  y = textoEnvuelto(doc, `Tipo: ${(perfil?.tipo_participante || "—").replace(/_/g, " ")}    Período: ${perfil?.periodo_asignado || "—"}`, 14, y, 182, 6);
  y = textoEnvuelto(doc, `Actividad: ${actividad?.nombre || "—"} (${actividad?.categoria || "—"})`, 14, y, 182, 6);
  y += 4;

  // Resumen del mes
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Resumen — ${nombreMes} ${anio}`, 14, y); y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y - 2, 196, y - 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Horas por fichaje: ${Math.round(horasMes * 100) / 100} h`, 14, y); y += 6;
  doc.text(`Horas bono: ${Math.round(horasBonoMes * 100) / 100} h`, 14, y); y += 6;
  doc.text(`Total del mes: ${totalMes} h`, 14, y); y += 6;
  doc.text(`Registros cerrados: ${regsMes.length}`, 14, y); y += 10;

  // Progreso general
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Progreso general", 14, y); y += 6;
  doc.line(14, y - 2, 196, y - 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Acumulado total: ${totalAcumulado} h / ${META} h (${porcentaje}%)`, 14, y); y += 6;
  doc.text(`Restantes: ${Math.max(0, META - totalAcumulado)} h`, 14, y); y += 10;

  // Detalle de registros del mes
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Detalle de fichajes", 14, y); y += 5;
  doc.line(14, y - 2, 196, y - 2); y += 4;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Fecha", 14, y); doc.text("Entrada", 60, y); doc.text("Salida", 90, y); doc.text("Horas", 125, y); y += 5;
  doc.setFont("helvetica", "normal");
  if (regsMes.length === 0) {
    doc.text("Sin registros en este mes.", 14, y); y += 5;
  }
  regsMes.forEach(r => {
    if (y > 270) { doc.addPage(); y = 20; }
    const [h1, m1] = (r.hora_entrada || "0:0").split(":").map(Number);
    const [h2, m2] = (r.hora_salida || "0:0").split(":").map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    const hrs = Math.round((mins / 60) * 100) / 100;
    doc.text(formatearFecha(r.fecha), 14, y);
    doc.text(r.hora_entrada || "—", 60, y);
    doc.text(r.hora_salida || "—", 90, y);
    doc.text(`${hrs} h`, 125, y);
    y += 5;
  });

  // Bonos del mes
  if (bonosMes.length > 0) {
    y += 4;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Bonos del mes", 14, y); y += 5;
    doc.line(14, y - 2, 196, y - 2); y += 4;
    doc.setFontSize(9);
    bonosMes.forEach(b => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(formatearFecha(b.fecha), 14, y);
      doc.text(`${b.horas} h`, 60, y);
      y = textoEnvuelto(doc, b.motivo || "—", 90, y, 106, 5, 270);
    });
  }

  // Footer
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Unidos Cuidando el Planeta · Documento generado automáticamente", 14, 290);
  }

  doc.save(`Reporte_UCP_${nombreMes}_${anio}.pdf`);
}