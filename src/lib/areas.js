// Catálogo de áreas de la UCP. Las actividades se agrupan bajo estas áreas.
export const AREAS = [
  { value: "Bodega", label: "Bodega" },
  { value: "Recolección de Pilas", label: "Recolección de Pilas" },
  { value: "Redes Sociales", label: "Redes Sociales" },
  { value: "Presentación y Relaciones", label: "Presentación y relaciones empresariales y públicas" },
];

export const AREA_VALUES = AREAS.map((a) => a.value);

// Áreas de tipo bodega: su personal solo registra ENTRADAS de material
// (las salidas y ventas las hace el administrador).
export const AREAS_BODEGA = ["Bodega"];
export const esAreaBodega = (area) => AREAS_BODEGA.includes(area);

export const labelArea = (v) => AREAS.find((a) => a.value === v)?.label || v || "—";

// Etiquetas internas del personal de Bodega: indican en qué bodega física
// trabaja la persona (CU1 o CU2). NO son áreas: el área sigue siendo "Bodega".
export const ETIQUETAS_BODEGA = [
  { value: "CU1", label: "CU1 (Bodega 1)" },
  { value: "CU2", label: "CU2 (Bodega 2)" },
];
export const ETIQUETA_VALUES = ETIQUETAS_BODEGA.map((e) => e.value);
export const labelEtiqueta = (v) => ETIQUETAS_BODEGA.find((e) => e.value === v)?.label || v || "";
