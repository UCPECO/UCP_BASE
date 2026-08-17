// Catálogo de áreas de la UCP. Las actividades se agrupan bajo estas áreas.
export const AREAS = [
  { value: "Bodega", label: "Bodega" },
  { value: "Recolección de Pilas", label: "Recolección de Pilas" },
  { value: "Redes Sociales", label: "Redes Sociales" },
  { value: "Presentación y Relaciones", label: "Presentación y relaciones empresariales y públicas" },
];

export const AREA_VALUES = AREAS.map((a) => a.value);

export const labelArea = (v) => AREAS.find((a) => a.value === v)?.label || v || "—";