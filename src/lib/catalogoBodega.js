// Catálogo de bodega (Materiales recibidos). Reusa las categorías anidadas de artículos
// de electrónicos (Categoría → Subcategoría → Material, en unidades) y añade materiales
// propios de bodega medidos por peso (kg): cartón, vidrio, metales, crudo, plásticos, etc.
import { CATEGORIAS_ELECTRONICOS } from "@/lib/catalogoElectronicos";

export { CATEGORIAS_ELECTRONICOS };

export const MATERIALES_PESO_BODEGA = [
  { value: "plasticos", label: "Plásticos" },
  { value: "metales", label: "Metales" },
  { value: "carton", label: "Cartón" },
  { value: "vidrio", label: "Vidrio" },
  { value: "crudo_extraido", label: "Material crudo extraído" },
  { value: "plastico_triturado", label: "Plástico triturado" },
  { value: "cobre", label: "Cobre" },
  { value: "aluminio", label: "Aluminio" },
  { value: "hierro", label: "Hierro" },
  { value: "placas_pcb", label: "Placas PCB" },
];

// Lista plana para reportes / resúmenes: peso (kg) + categorías de artículos (unidades)
export const CATEGORIAS_FLAT_BODEGA = [
  ...MATERIALES_PESO_BODEGA.map((m) => ({ ...m, medida: "kg" })),
  ...CATEGORIAS_ELECTRONICOS.map((c) => ({ value: c.value, label: c.label, medida: "unidades" })),
];

export const CAT_LABEL_BODEGA = Object.fromEntries(CATEGORIAS_FLAT_BODEGA.map((c) => [c.value, c.label]));
export const CAT_MEDIDA_BODEGA = Object.fromEntries(CATEGORIAS_FLAT_BODEGA.map((c) => [c.value, c.medida]));
export const MEDIDA_LABEL = { kg: "kg", unidades: "u" };

export function labelCategoriaBodega(cat) {
  return CAT_LABEL_BODEGA[cat] || cat || "—";
}

export function medidaDeRegistroBodega(m) {
  if (m.tipo_registro === "procesado") return "kg";
  return m.medida || "unidades";
}