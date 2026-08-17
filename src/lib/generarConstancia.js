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

// Carga el logo como dataURL para incrustarlo en el PDF. Si falla (offline,
// primera carga sin caché), la constancia se genera sin logo.
let logoDataURL = null;
async function cargarLogo() {
  if (logoDataURL) return logoDataURL;
  const res = await fetch("/branding/logo-flat.png");
  const blob = await res.blob();
  logoDataURL = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
  return logoDataURL;
}

// Genera un PDF de constancia y lo descarga. Devuelve el doc para uso interno.
export async function generarConstanciaPDF(c) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // Marco decorativo
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(2);
  doc.rect(10, 10, W - 20, H - 20);
  doc.setLineWidth(0.5);
  doc.rect(13, 13, W - 26, H - 26);

  // Logo
  try {
    const logo = await cargarLogo();
    doc.addImage(logo, "PNG", W / 2 - 13, 15, 26, 26);
  } catch (e) { /* sin logo si no se pudo cargar */ }

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 90, 75);
  doc.setFontSize(26);
  doc.text("Unidos Cuidando el Planeta", W / 2, 48, { align: "center" });
  doc.setFontSize(13);
  doc.setTextColor(120, 120, 120);
  doc.setFont("helvetica", "normal");
  doc.text("Servicio Social y Voluntariado", W / 2, 55, { align: "center" });

  // Línea separadora
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(0.8);
  doc.line(40, 60, W - 40, 60);

  // Título del documento
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 50, 40);
  doc.setFontSize(22);
  doc.text(TIPOS_LABEL[c.tipo] || "Constancia", W / 2, 71, { align: "center" });

  // Cuerpo
  doc.setFont("helvetica", "normal");
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(13);
  const cuerpoY = 86;
  const colX = W / 2;

  doc.text(`Otorga la presente a:`, colX, cuerpoY, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  // Nombre envuelto para que nunca se salga del marco
  const lineasNombre = doc.splitTextToSize(c.usuario_nombre || "—", W - 70);
  lineasNombre.forEach((l, i) => {
    doc.text(l, colX, cuerpoY + 12 + i * 9, { align: "center" });
  });
  const despuesNombre = cuerpoY + 12 + (lineasNombre.length - 1) * 9;

  if (c.matricula) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(`Matrícula: ${c.matricula}`, colX, despuesNombre + 9, { align: "center" });
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  let linea = despuesNombre + (c.matricula ? 19 : 18);
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