// Exporta filas a CSV compatible con Excel (UTF-8 con BOM, punto y coma
// como separador para que Excel en español lo abra con columnas correctas).
export function descargarCsv(nombreArchivo, columnas, filas) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = columnas.map((c) => esc(c.titulo)).join(";");
  const cuerpo = filas.map((f) => columnas.map((c) => esc(typeof c.valor === "function" ? c.valor(f) : f[c.clave])).join(";"));
  const blob = new Blob(["﻿" + [encabezado, ...cuerpo].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo.endsWith(".csv") ? nombreArchivo : `${nombreArchivo}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Fecha YYYY-MM-DD para nombres de archivo
export function fechaArchivo() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
