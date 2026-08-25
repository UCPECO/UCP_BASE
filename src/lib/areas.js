// Catálogo de áreas de la UCP. Las actividades se agrupan bajo estas áreas.
// CU1 y CU2 son ÁREAS INDEPENDIENTES (bodegas físicas distintas), cada una
// con su propio encargado, su propio QR y sus propios registros.
export const AREAS = [
  { value: "Bodega CU1", label: "Bodega CU1" },
  { value: "Bodega CU2", label: "Bodega CU2" },
  { value: "Recolección de Pilas", label: "Recolección de Pilas" },
  { value: "Redes Sociales", label: "Redes Sociales" },
  { value: "Presentación y Relaciones", label: "Presentación y relaciones empresariales y públicas" },
];

export const AREA_VALUES = AREAS.map((a) => a.value);

// Valor legacy: registros y usuarios antiguos pueden seguir con el área
// genérica "Bodega" (antes de que CU1/CU2 se separaran). No aparece en los
// selectores, pero debe mostrarse correctamente en datos históricos.
export const AREA_LEGACY = { Bodega: "Bodega (general)" };

// Áreas de tipo bodega: su personal solo registra ENTRADAS de material
// (las salidas y ventas las hace el administrador). Incluye el valor legacy.
export const AREAS_BODEGA = ["Bodega", "Bodega CU1", "Bodega CU2"];
export const esAreaBodega = (area) => AREAS_BODEGA.includes(area);

export const labelArea = (v) =>
  AREAS.find((a) => a.value === v)?.label || AREA_LEGACY[v] || v || "—";

// DEPRECADO: antes CU1/CU2 eran "etiquetas" internas del área Bodega.
// Se conservan solo para mostrar datos históricos (users.etiqueta).
// Para asignar alguien a una bodega usa el área "Bodega CU1" / "Bodega CU2".
export const ETIQUETAS_BODEGA = [
  { value: "CU1", label: "CU1 (Bodega 1)" },
  { value: "CU2", label: "CU2 (Bodega 2)" },
];
export const ETIQUETA_VALUES = ETIQUETAS_BODEGA.map((e) => e.value);
export const labelEtiqueta = (v) => ETIQUETAS_BODEGA.find((e) => e.value === v)?.label || v || "";
