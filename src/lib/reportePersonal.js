import { jsPDF } from "jspdf";
import { formatearFecha } from "@/lib/ucpUtils";
import { textoEnvuelto, celdaCorta } from "@/lib/pdfUtils";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function horasRegistro(r) {
  if (!r.hora_entrada || !r.hora_salida) return 0;
  const [h1, m1] = r.hora_entrada.split(":").map(Number);
  const [h2, m2] = r.hora_salida.split(":").map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

function enMes(fecha, mes, anio) {
  if (!fecha) return false;
  const f = new Date(fecha);
  return f.getMonth() === mes && f.getFullYear() === anio;
}

export function generarReportePersonalPdfMensual({ usuarios, registros, bonos, incidencias, actividades, mes, anio }) {
  const doc = new jsPDF();
  const hoy = new Date();
  const nombreMes = MESES[mes];

  const actsById = {};
  (actividades || []).forEach((a) => { actsById[a.id] = a; });

  // Excluir admin y encargados: sus horas no se registran como servicio social
  const personal = (usuarios || []).filter((u) => u.role !== "admin" && u.role !== "encargado");
  const personalIds = new Set(personal.map((u) => u.id));
  const regsPersonal = (registros || []).filter((r) => personalIds.has(r.usuario));
  const bonosPersonal = (bonos || []).filter((b) => personalIds.has(b.usuario));
  const incsPersonal = (incidencias || []).filter((i) => personalIds.has(i.usuario_afectado) || i.usuario_afectado == null);

  // Totales del mes (solo fichajes validados cuentan; los demás se reportan aparte)
  const regsMesTodos = regsPersonal.filter((r) => enMes(r.fecha, mes, anio) && (r.estado_registro === "cerrado" || r.estado_registro === "incompleto"));
  const regsMes = regsMesTodos.filter((r) => r.validado);
  const regsMesPorValidar = regsMesTodos.filter((r) => !r.validado);
  const bonosMes = bonosPersonal.filter((b) => enMes(b.fecha, mes, anio));
  const incsMes = incsPersonal.filter((i) => enMes(i.created_date, mes, anio));

  const horasFichajeMes = regsMes.reduce((a, r) => a + horasRegistro(r), 0);
  const horasPorValidarMes = regsMesPorValidar.reduce((a, r) => a + horasRegistro(r), 0);
  const horasBonoMes = bonosMes.reduce((a, b) => a + (b.horas || 0), 0);
  const totalMes = Math.round((horasFichajeMes + horasBonoMes) * 100) / 100;

  // Acumulado histórico (solo validados)
  const horasFichajeHist = regsPersonal.filter((r) => (r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && r.validado).reduce((a, r) => a + horasRegistro(r), 0);
  const horasBonoHist = bonosPersonal.reduce((a, b) => a + (b.horas || 0), 0);
  const totalAcumulado = Math.round((horasFichajeHist + horasBonoHist) * 100) / 100;

  // Por persona
  const personas = personal.map((u) => {
    const regsU = (registros || []).filter((r) => r.usuario === u.id);
    const bonosU = bonosPersonal.filter((b) => b.usuario === u.id);
    const fichajeMes = regsU.filter((r) => enMes(r.fecha, mes, anio) && (r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && r.validado).reduce((a, r) => a + horasRegistro(r), 0);
    const bonoMes = bonosU.filter((b) => enMes(b.fecha, mes, anio)).reduce((a, b) => a + (b.horas || 0), 0);
    const acum = regsU.filter((r) => (r.estado_registro === "cerrado" || r.estado_registro === "incompleto") && r.validado).reduce((a, r) => a + horasRegistro(r), 0) + bonosU.reduce((a, b) => a + (b.horas || 0), 0);
    const incs = incsPersonal.filter((i) => enMes(i.created_date, mes, anio) && (i.usuario_afectado === u.id || i.usuario_afectado === u.email || i.creado_por === u.id)).length;
    return {
      nombre: u.nombre_completo || u.full_name || "—",
      rol: u.role || "—",
      matricula: u.matricula || "—",
      horasMes: Math.round((fichajeMes + bonoMes) * 100) / 100,
      acumulado: Math.round(acum * 100) / 100,
      incs,
    };
  }).sort((a, b) => b.horasMes - a.horasMes);

  // ===== Header =====
  doc.setFillColor(15, 96, 80);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Unidos Cuidando el Planeta · Reporte de Personal", 14, 14);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${nombreMes} ${anio}`, 14, 23);
  doc.text(`Generado: ${hoy.toLocaleDateString("es-MX")}`, 14, 28);

  // ===== Resumen general =====
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Resumen general", 14, 44);
  doc.setDrawColor(220, 220, 220);
  doc.line(14, 46, 196, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = 53;
  doc.text(`Personal de servicio social: ${personas.length}`, 14, y); y += 6;
  doc.text(`Horas validadas por fichaje del mes: ${Math.round(horasFichajeMes * 100) / 100} h`, 14, y); y += 6;
  doc.text(`Horas pendientes de validación del mes: ${Math.round(horasPorValidarMes * 100) / 100} h`, 14, y); y += 6;
  doc.text(`Horas de premio del mes: ${Math.round(horasBonoMes * 100) / 100} h`, 14, y); y += 6;
  doc.text(`Total de horas del mes (validadas + premio): ${totalMes} h`, 14, y); y += 6;
  doc.text(`Incidencias del mes: ${incsMes.length}`, 14, y); y += 6;
  doc.text(`Horas acumuladas (histórico validado): ${totalAcumulado} h`, 14, y); y += 10;

  // ===== Tabla por persona =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Horas por persona", 14, y); y += 4;
  doc.line(14, y, 196, y); y += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("#", 14, y); doc.text("Nombre", 22, y); doc.text("Rol", 100, y);
  doc.text("Horas mes", 130, y); doc.text("Acumulado", 160, y); doc.text("Inc.", 190, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (personas.length === 0) { doc.text("Sin personal registrado.", 14, y); y += 5; }
  personas.forEach((p, idx) => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(String(idx + 1), 14, y);
    celdaCorta(doc, p.nombre, 22, y, 76);
    celdaCorta(doc, p.rol, 100, y, 28);
    doc.text(`${p.horasMes} h`, 130, y);
    doc.text(`${p.acumulado} h`, 160, y);
    doc.text(String(p.incs), 190, y);
    y += 5;
  });
  y += 6;

  // ===== Incidencias del mes =====
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Incidencias del mes", 14, y); y += 4;
  doc.line(14, y, 196, y); y += 6;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("Fecha", 14, y); doc.text("Persona", 42, y); doc.text("Tipo", 95, y);
  doc.text("Prioridad", 125, y); doc.text("Estado", 150, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  if (incsMes.length === 0) { doc.text("Sin incidencias en este mes.", 14, y); y += 5; }
  incsMes.forEach((i) => {
    if (y > 265) { doc.addPage(); y = 20; }
    const persona = personal.find((u) => u.id === i.usuario_afectado || u.email === i.usuario_afectado || u.id === i.creado_por);
    doc.text(formatearFecha(i.created_date), 14, y);
    celdaCorta(doc, persona ? (persona.nombre_completo || persona.full_name) : "—", 42, y, 51);
    celdaCorta(doc, (i.tipo_incidencia || "—").replace(/_/g, " "), 95, y, 28);
    celdaCorta(doc, i.prioridad || "—", 125, y, 23);
    celdaCorta(doc, (i.estado_incidencia || "—").replace(/_/g, " "), 150, y, 46);
    y += 4;
    // La descripción va en su propia línea envuelta: nunca se sale de la página
    doc.setTextColor(90, 90, 90);
    y = textoEnvuelto(doc, i.descripcion || "—", 42, y, 154, 3.6, 272);
    doc.setTextColor(40, 40, 40);
    y += 1.5;
  });

  // ===== Footer =====
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Unidos Cuidando el Planeta · Reporte consolidado generado automáticamente", 14, 290);
  }

  doc.save(`Reporte_Personal_UCP_${nombreMes}_${anio}.pdf`);
}