// Helpers para jsPDF: texto que cabe en su ancho, con salto de página automático.

// Escribe texto envuelto en varias líneas dentro de maxWidth.
// Si se acaba la página (y > maxY) agrega una nueva y sigue escribiendo.
// Devuelve la posición y siguiente (ya con un lineHeight extra al final).
export function textoEnvuelto(doc, texto, x, y, maxWidth, lineHeight = 5, maxY = 280) {
  const lineas = doc.splitTextToSize(String(texto ?? "—"), maxWidth);
  for (const linea of lineas) {
    if (y > maxY) { doc.addPage(); y = 20; }
    doc.text(linea, x, y);
    y += lineHeight;
  }
  return y;
}

// Escribe solo la primera línea del texto envuelto (para celdas angostas de tablas).
// Si el texto no cabe, termina con elipsis. No cambia y.
export function celdaCorta(doc, texto, x, y, maxWidth) {
  const lineas = doc.splitTextToSize(String(texto ?? "—"), maxWidth);
  let t = lineas[0] || "—";
  if (lineas.length > 1 && t.length > 1) t = t.slice(0, -1) + "…";
  doc.text(t, x, y);
}
