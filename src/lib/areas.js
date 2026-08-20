// Catálogo de áreas de la UCP. Las actividades se agrupan bajo estas áreas.
export const AREAS = [
  { value: "Bodega", label: "Bodega" },
  { value: "CU1", label: "CU1 (Bodega 1)" },
  { value: "CU2", label: "CU2 (Bodega 2)" },
  { value: "Recolección de Pilas", label: "Recolección de Pilas" },
  { value: "Redes Sociales", label: "Redes Sociales" },
  { value: "Presentación y Relaciones", label: "Presentación y relaciones empresariales y públicas" },
];

export const AREA_VALUES = AREAS.map((a) => a.value);

// Áreas de tipo bodega: su personal solo registra ENTRADAS de material
// (las salidas y ventas las hace el administrador).
export const AREAS_BODEGA = ["Bodega", "CU1", "CU2"];
export const esAreaBodega = (area) => AREAS_BODEGA.includes(area);

export const labelArea = (v) => AREAS.find((a) => a.value === v)?.label || v || "—";
