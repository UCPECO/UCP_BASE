// Cálculo de huella de carbono evitada por reciclaje y generación del
// documento formal en PDF (con folio). Los factores son estimaciones de
// emisiones evitadas al reciclar en lugar de producir material virgen.
import { jsPDF } from "jspdf";
import { CAT_LABEL_BODEGA } from "@/lib/catalogoBodega";

// kg CO2e evitados por cada kg de material reciclado (categorías por peso)
export const FACTORES_KG = {
  plasticos: 1.5,
  metales: 2.5,
  carton: 0.9,
  vidrio: 0.3,
  crudo_extraido: 2.0,
  plastico_triturado: 1.5,
  cobre: 4.0,
  aluminio: 9.0,
  hierro: 1.5,
  placas_pcb: 5.0,
};

// Categorías por unidad: peso promedio estimado por unidad (kg).
// Es el RESPALDO cuando no se reconoce el tipo de artículo.
export const PESO_PROMEDIO_UNIDAD = {
  "Computadoras y Periféricos": 5,
  "Celulares": 0.2,
  "Tablets": 0.5,
  "Telecomunicaciones": 0.5,
  "Audio Video y Entretenimiento": 12,
  "Equipos de Oficina": 15,
  "Electrodomésticos Pequeños": 3,
  "Equipos Industriales y Médicos": 10,
  "Iluminación y Energía": 2,
  "Cables Conectores y Accesorios": 0.2,
  "Baterías y Pilas": 1,
  "Residuos de Procesamiento": 1.5,
};

// Pesos típicos por TIPO de artículo (kg/unidad). Se buscan como palabras
// clave dentro del material/subcategoría capturados al registrar la entrada.
// Ordenados de lo más específico a lo más general.
const PESOS_CLAVE = [
  // Computación
  [["laptop", "portatil", "portátil", "notebook"], 2.2],
  [["monitor crt", "crt"], 13],
  [["monitor", "pantalla led", "pantalla lcd"], 4],
  [["todo en uno", "all in one"], 6],
  [["gabinete", "cpu", "escritorio", "pc", "torre"], 9],
  [["servidor", "server"], 15],
  [["teclado"], 0.6],
  [["mouse", "raton", "ratón"], 0.1],
  [["impresora", "multifuncional"], 7],
  [["escaner", "escáner"], 4],
  [["fuente de poder"], 1],
  [["disco duro", "ssd", "hdd"], 0.3],
  [["tarjeta madre", "motherboard"], 0.8],
  [["memoria ram", "ram"], 0.05],
  [["ups", "no break", "nobreak"], 6],
  // Móviles y telecom
  [["celular", "smartphone", "telefono", "teléfono", "iphone"], 0.2],
  [["tablet"], 0.5],
  [["router", "modem", "módem"], 0.4],
  [["switch", "access point", "antena"], 1],
  // Audio/video
  [["television", "televisión", "tv", "smart tv"], 10],
  [["proyector"], 3],
  [["bocina", "altavoz", "soundbar", "barra de sonido"], 1.5],
  [["consola", "videojuego", "xbox", "playstation", "nintendo"], 1.2],
  [["camara", "cámara"], 0.4],
  [["estereo", "estéreo", "reproductor", "dvd", "blu-ray"], 2],
  // Electrodomésticos
  [["microondas"], 12],
  [["licuadora"], 2.5],
  [["cafetera"], 1.5],
  [["ventilador"], 3],
  [["plancha"], 1.2],
  [["tostador", "horno"], 4],
  [["batidora"], 2],
  [["secadora de pelo", "secadora de cabello"], 0.5],
  [["aspiradora"], 6],
  [["lampara", "lámpara", "foco", "tubo led"], 0.15],
  // Accesorios
  [["cargador"], 0.2],
  [["cable", "conector", "adaptador", "extension", "extensión"], 0.15],
  [["audifonos", "audífonos", "diadema", "headset"], 0.25],
  // Baterías por unidad
  [["bateria de auto", "batería de auto", "acumulador"], 15],
  [["bateria", "batería"], 0.4],
  [["pila"], 0.05],
];

function normalizar(txt) {
  return String(txt || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Peso estimado de UNA unidad según el tipo de artículo capturado.
// Orden de búsqueda: material/subcategoría → categoría personalizada con
// peso definido → promedio de la categoría → 1 kg.
export function pesoEstimadoUnidad({ categoria, subcategoria, material }, customCats = []) {
  const texto = normalizar(`${material || ""} ${subcategoria || ""}`);
  if (texto) {
    for (const [claves, peso] of PESOS_CLAVE) {
      if (claves.some((k) => texto.includes(normalizar(k)))) return peso;
    }
  }
  const custom = (customCats || []).find((c) => c.nombre === categoria);
  if (custom && Number(custom.peso_estimado) > 0) return Number(custom.peso_estimado);
  return PESO_PROMEDIO_UNIDAD[categoria] ?? 1;
}

// kg CO2e evitados por kg de residuo electrónico reciclado correctamente
export const FACTOR_EWASTE = 1.4;

// Calcula el desglose a partir de los registros de entradas (bodega +
// electrónicos) ya filtrados por periodo. Los artículos por unidad se
// agrupan por TIPO (material/subcategoría) porque no pesa lo mismo una
// laptop que un monitor: cada grupo usa su propio peso estimado.
// `pesosManual`: { [llave]: kg } — peso por unidad ajustado a mano por el
// admin en la pantalla de huella (pisa al estimado automático).
// También devuelve `empresas`: el mismo cálculo catalogado por empresa/
// persona donante, para reportes por procedencia.
export function calcularHuella(materiales, electronicos, customCats = [], pesosManual = {}) {
  const mapa = {};
  const mapaEmp = {};
  const add = (reg) => {
    if (!reg.categoria) return;
    const medida = reg.tipo_registro === "procesado" ? "kg" : (reg.medida || "unidades");
    // En kg se agrupa por categoría; en unidades por tipo de artículo
    const tipo = medida === "kg" ? "" : normalizar(reg.material || reg.subcategoria || "");
    const llave = `${reg.categoria}|${medida}|${tipo}`;
    if (!mapa[llave]) {
      const etiqueta = medida === "kg"
        ? (CAT_LABEL_BODEGA[reg.categoria] || reg.categoria)
        : (reg.material || reg.subcategoria || CAT_LABEL_BODEGA[reg.categoria] || reg.categoria);
      mapa[llave] = { llave, categoria: reg.categoria, subcategoria: reg.subcategoria, material: reg.material, label: etiqueta, cantidad: 0, medida };
    }
    mapa[llave].cantidad += Number(reg.cantidad) || 0;

    // Catálogo por empresa/persona donante
    const emp = (reg.proveedor || "").trim() || "Sin nombre";
    if (!mapaEmp[emp]) {
      mapaEmp[emp] = { empresa: emp, tipo: reg.tipo_proveedor === "empresa" ? "empresa" : "persona", recepciones: 0, kg: 0, co2e: 0 };
    }
    const cant = Number(reg.cantidad) || 0;
    mapaEmp[emp].recepciones += 1;
    if (medida === "kg") {
      const f = FACTORES_KG[reg.categoria] ?? 1.0;
      mapaEmp[emp].kg += cant;
      mapaEmp[emp].co2e += cant * f;
    } else {
      const manual = Number(pesosManual[llave]);
      const pU = manual > 0 ? manual : pesoEstimadoUnidad(reg, customCats);
      mapaEmp[emp].kg += cant * pU;
      mapaEmp[emp].co2e += cant * pU * FACTOR_EWASTE;
    }
  };
  (materiales || []).forEach(add);
  (electronicos || []).forEach(add);

  const desglose = Object.values(mapa).map((d) => {
    let kg = 0, co2e = 0, factor = 0, pesoU = null, pesoManual = false;
    if (d.medida === "kg") {
      kg = d.cantidad;
      factor = FACTORES_KG[d.categoria] ?? 1.0;
      co2e = kg * factor;
    } else {
      const manual = Number(pesosManual[d.llave]);
      if (manual > 0) { pesoU = manual; pesoManual = true; }
      else { pesoU = pesoEstimadoUnidad(d, customCats); }
      kg = d.cantidad * pesoU;
      factor = FACTOR_EWASTE;
      co2e = kg * factor;
    }
    return {
      ...d,
      peso_u: pesoU,
      peso_manual: pesoManual,
      kg_estimados: Math.round(kg * 100) / 100,
      factor,
      co2e: Math.round(co2e * 100) / 100,
    };
  }).sort((a, b) => b.co2e - a.co2e);

  const totales = desglose.reduce((t, d) => ({
    kg: t.kg + d.kg_estimados,
    unidades: t.unidades + (d.medida === "unidades" ? d.cantidad : 0),
    co2e: t.co2e + d.co2e,
  }), { kg: 0, unidades: 0, co2e: 0 });

  const empresas = Object.values(mapaEmp)
    .map((e) => ({ ...e, kg: Math.round(e.kg * 100) / 100, co2e: Math.round(e.co2e * 100) / 100 }))
    .sort((a, b) => b.co2e - a.co2e);

  return {
    desglose,
    empresas,
    total_kg: Math.round(totales.kg * 100) / 100,
    total_unidades: totales.unidades,
    total_co2e: Math.round(totales.co2e * 100) / 100,
  };
}

// ---- PDF formal ----

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

function fmtFecha(f) {
  if (!f) return "—";
  return new Date(f + (f.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

// reporte: { folio, periodo_inicio, periodo_fin, desglose (array o JSON),
//            total_kg, total_unidades, total_co2e, generado_por_nombre, created_date }
export async function generarPdfHuella(reporte) {
  const desglose = typeof reporte.desglose === "string" ? JSON.parse(reporte.desglose || "[]") : (reporte.desglose || []);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 18; // margen

  // Marco
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(1.2);
  doc.rect(8, 8, W - 16, H - 16);
  doc.setLineWidth(0.3);
  doc.rect(10.5, 10.5, W - 21, H - 21);

  // Logo + encabezado
  try {
    const logo = await cargarLogo();
    doc.addImage(logo, "PNG", M, 16, 22, 22);
  } catch (e) { /* sin logo si no carga */ }

  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 90, 75);
  doc.setFontSize(17);
  doc.text("Unidos Cuidando el Planeta", M + 26, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  doc.text("Programa de Reciclaje y Economía Circular", M + 26, 31);
  doc.text("Servicio Social y Voluntariado", M + 26, 36);

  // Folio destacado a la derecha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 90, 75);
  doc.text(`FOLIO: ${reporte.folio || "—"}`, W - M, 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Emitido: ${fmtFecha((reporte.created_date || new Date().toISOString()).slice(0, 10))}`, W - M, 31, { align: "right" });

  // Título del documento
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(0.6);
  doc.line(M, 46, W - M, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(20, 50, 40);
  doc.text("REPORTE DE HUELLA DE CARBONO", W / 2, 55, { align: "center" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 90);
  doc.text("Emisiones de CO2e evitadas por recepción y reciclaje de materiales", W / 2, 61, { align: "center" });

  // Periodo
  doc.setFontSize(10.5);
  doc.setTextColor(40, 40, 40);
  doc.text(`Periodo de recepción: ${fmtFecha(reporte.periodo_inicio)} — ${fmtFecha(reporte.periodo_fin)}`, W / 2, 69, { align: "center" });

  // Tabla de desglose
  let y = 78;
  const cols = [M, M + 52, M + 74, M + 98, M + 122, W - M]; // bordes x de columnas
  const cabecera = ["Categoría", "Cantidad", "Peso est. (kg)", "Factor", "CO2e evitado (kg)"];

  const dibujarCabecera = (yy) => {
    doc.setFillColor(20, 120, 100);
    doc.rect(M, yy - 5, W - 2 * M, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(cabecera[0], cols[0] + 2, yy);
    doc.text(cabecera[1], cols[2] - 2, yy, { align: "right" });
    doc.text(cabecera[2], cols[3] - 2, yy, { align: "right" });
    doc.text(cabecera[3], cols[4] - 2, yy, { align: "right" });
    doc.text(cabecera[4], cols[5] - 2, yy, { align: "right" });
  };

  dibujarCabecera(y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);

  desglose.forEach((d, i) => {
    if (y > H - 60) { doc.addPage(); y = 24; dibujarCabecera(y); y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); }
    if (i % 2 === 0) { doc.setFillColor(240, 248, 245); doc.rect(M, y - 4.5, W - 2 * M, 6.5, "F"); }
    doc.setTextColor(40, 40, 40);
    const label = doc.splitTextToSize(`${d.label}${d.medida === "unidades" ? ` (u × ${d.peso_u ?? 1} kg)` : ""}`, 48);
    doc.text(label[0], cols[0] + 2, y);
    doc.text(String(d.cantidad), cols[2] - 2, y, { align: "right" });
    doc.text(d.kg_estimados.toLocaleString("es-MX"), cols[3] - 2, y, { align: "right" });
    doc.text(`${d.factor} kg/kg`, cols[4] - 2, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(d.co2e.toLocaleString("es-MX"), cols[5] - 2, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 6.5;
  });

  // Totales
  y += 3;
  doc.setDrawColor(20, 120, 100);
  doc.setLineWidth(0.5);
  doc.line(M, y - 4, W - M, y - 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(20, 90, 75);
  doc.text("TOTALES", cols[0] + 2, y + 2);
  doc.text(`${reporte.total_unidades || 0} u`, cols[2] - 2, y + 2, { align: "right" });
  doc.text(`${(reporte.total_kg || 0).toLocaleString("es-MX")} kg`, cols[3] - 2, y + 2, { align: "right" });
  doc.text(`${(reporte.total_co2e || 0).toLocaleString("es-MX")} kg`, cols[5] - 2, y + 2, { align: "right" });
  y += 12;

  // Desglose por empresa / donante
  const porEmpresa = typeof reporte.por_empresa === "string" ? JSON.parse(reporte.por_empresa || "[]") : (reporte.por_empresa || []);
  if (porEmpresa.length > 0) {
    if (y > H - 80) { doc.addPage(); y = 28; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 90, 75);
    doc.text("DESGLOSE POR EMPRESA / DONANTE", M, y);
    y += 3;
    const ex = { emp: M + 2, tipo: M + 96, rec: M + 116, kg: M + 146, co2: W - M - 2 };
    const cabEmp = (yy) => {
      doc.setFillColor(20, 120, 100);
      doc.rect(M, yy - 5, W - 2 * M, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(255, 255, 255);
      doc.text("Empresa / donante", ex.emp, yy);
      doc.text("Tipo", ex.tipo, yy);
      doc.text("Recep.", ex.rec, yy, { align: "right" });
      doc.text("Peso (kg)", ex.kg, yy, { align: "right" });
      doc.text("CO2e (kg)", ex.co2, yy, { align: "right" });
    };
    cabEmp(y + 4);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    porEmpresa.forEach((e, i) => {
      if (y > H - 55) { doc.addPage(); y = 24; cabEmp(y); y += 4; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); }
      if (i % 2 === 0) { doc.setFillColor(240, 248, 245); doc.rect(M, y - 4.5, W - 2 * M, 6.5, "F"); }
      doc.setTextColor(40, 40, 40);
      const nombre = doc.splitTextToSize(e.empresa, 88);
      doc.text(nombre[0], ex.emp, y);
      doc.text(e.tipo === "empresa" ? "Empresa" : "Persona", ex.tipo, y);
      doc.text(String(e.recepciones), ex.rec, y, { align: "right" });
      doc.text(e.kg.toLocaleString("es-MX"), ex.kg, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(e.co2e.toLocaleString("es-MX"), ex.co2, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 6.5;
    });
    y += 8;
  }

  // Resumen destacado
  const toneladas = Math.round(((reporte.total_co2e || 0) / 1000) * 1000) / 1000;
  const arboles = Math.round((reporte.total_co2e || 0) / 21);
  const kmAuto = Math.round((reporte.total_co2e || 0) / 0.192);
  doc.setFillColor(232, 245, 239);
  doc.roundedRect(M, y, W - 2 * M, 26, 2, 2, "F");
  doc.setFontSize(11);
  doc.setTextColor(20, 90, 75);
  doc.text(`CO2e total evitado: ${(reporte.total_co2e || 0).toLocaleString("es-MX")} kg  (${toneladas} toneladas)`, W / 2, y + 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`Equivalente aproximado a: ${arboles.toLocaleString("es-MX")} árboles absorbiendo CO2 durante un año`, W / 2, y + 15, { align: "center" });
  doc.text(`o a ${kmAuto.toLocaleString("es-MX")} km recorridos por un automóvil a gasolina`, W / 2, y + 21, { align: "center" });
  y += 34;

  // Nota metodológica
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  const ajusteManual = desglose.some((d) => d.peso_manual);
  const nota = "Metodología: las emisiones evitadas se estiman multiplicando el peso del material recibido por un factor de emisión evitada al reciclar en lugar de producir material virgen. Para artículos por unidad se usa el peso típico del tipo de artículo (laptop, monitor, celular, etc.) y, si no se reconoce, el promedio de su categoría. Factores de referencia: plásticos 1.5, metales 2.5, cartón 0.9, vidrio 0.3, cobre 4.0, aluminio 9.0, hierro 1.5, PCB 5.0 kg CO2e/kg; residuo electrónico 1.4 kg CO2e/kg. Valores aproximados con fines de reporte interno."
    + (ajusteManual ? " Nota: uno o más pesos por unidad fueron ajustados manualmente por el responsable al momento de generar este documento." : "");
  doc.text(doc.splitTextToSize(nota, W - 2 * M - 4), M + 2, y);
  y += 24;

  // Firmas
  if (y > H - 55) { doc.addPage(); y = 30; }
  const yFirma = Math.max(y + 10, H - 48);
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.4);
  doc.line(M + 8, yFirma, M + 78, yFirma);
  doc.line(W - M - 78, yFirma, W - M - 8, yFirma);
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text("Generado por", M + 43, yFirma + 5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.text(reporte.generado_por_nombre || "—", M + 43, yFirma + 10, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.text("Responsable de área", W - M - 43, yFirma + 5, { align: "center" });

  // Pie
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text(`Documento oficial con folio ${reporte.folio || "—"} · Unidos Cuidando el Planeta`, W / 2, H - 14, { align: "center" });

  doc.save(`huella_carbono_${reporte.folio || "reporte"}.pdf`);
  return doc;
}
