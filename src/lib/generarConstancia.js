import { jsPDF } from "jspdf";

const TIPOS_LABEL = {
  constancia_termino: "Constancia de Término",
  reconocimiento: "Reconocimiento",
  recomendacion: "Carta de Recomendación",
};

const AREA_LABEL = {
  Bodega: "Bodega",
  "Recolección de Pilas": "Recolección de Pilas",
  "Redes Sociales": "Redes Sociales",
  "Presentación y Relaciones": "Presentación y Relaciones",
};

// Genera un PDF de constancia y lo descarga. Devuelve el doc para uso interno.
export function generarConstanciaPDF(c) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Marco decorativo
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(2);
  doc.rect(10, 10, W - 20, H - 20);
  doc.setLineWidth(0.5);
  doc.rect(13, 13, W - 26, H - 26);

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 90, 75);
  doc.setFontSize(26);
  doc.text("Unidos Cuidando el Planeta", W / 2, 30, { align: "center" });
  doc.setFontSize(13);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.text("Servicio Social y Voluntariado", W / 2, 38, { align: "center" });

  // Línea separadora
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(0.8);
  doc.line(40, 44, W - 40, 44);

  // Título del documento
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 50, 40);
  doc.setFontSize(22);
  doc.text(TIPOS_LABEL[c.tipo] || "Constancia", W / 2, 58, { align: "center" });

  // Cuerpo
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(13);
  const cuerpoY = 78;
  const colX = W / 2;

  doc.text(`Otorga la presente a:`, colX, cuerpoY, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(c.usuario_nombre || "—", colX, cuerpoY + 12, { align: "center" });

  if (c.matricula) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Matrícula: ${c.matricula}`, colX, cuerpoY + 20, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  let linea = cuerpoY + 32;
  if (c.area) {
    doc.text(`Área: ${AREA_LABEL[c.area] || c.area}`, colX, linea, { align: "center" });
    linea += 8;
  }
  if (c.horas_completadas != null) {
    doc.text(`Horas completadas: ${c.horas_completadas} hrs`, colX, linea, { align: "center" });
    linea += 8;
  }
  if (c.fecha_inicio && c.fecha_fin) {
    doc.text(
      `Período: ${formatear(c.fecha_inicio)} a ${formatear(c.fecha_fin)}`,
      colX,
      linea,
      { align: "center" }
    );
    linea += 8;
  }

  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(
    "Este documento es válido como comprobante oficial de participación.",
    colX,
    linea + 6,
    { align: "center" }
  );

  // Folio y fecha de emisión
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Folio: ${c.folio}`, 25, H - 22);
  doc.text(`Emitido el ${formatear(new Date().toISOString())}`, W - 25, H - 22, { align: "right" });

  if (c.estado === "revocada") {
    doc.setTextColor(180, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("— REVOCADA —", colX, H - 30, { align: "center" });
  }

  doc.save(`constancia_${c.folio}.pdf`);
  return doc;
}

function formatear(fecha) {
  if (!fecha) return "—";
  const d = new Date(fecha);
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}