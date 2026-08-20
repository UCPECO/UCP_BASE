// Categorías de materiales personalizadas (guardadas en la BD por el admin).
// Se fusionan con el catálogo base en los selectores de inventario, stock,
// ventas y huella de carbono. Caché en memoria para no repetir la consulta.
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

let cache = null;
let promesa = null;

export function invalidarCategoriasCustom() {
  cache = null;
  promesa = null;
}

export async function obtenerCategoriasCustom() {
  if (cache) return cache;
  if (!promesa) {
    promesa = base44.entities.Categorias_Material.filter({ activa: 1 }, "nombre", 200)
      .then((rows) => { cache = rows || []; return cache; })
      .catch(() => { cache = []; return cache; });
  }
  return promesa;
}

// Hook de React: devuelve las categorías personalizadas activas
export function useCategoriasCustom() {
  const [custom, setCustom] = useState(cache || []);
  useEffect(() => {
    let vivo = true;
    obtenerCategoriasCustom().then((rows) => { if (vivo) setCustom(rows); });
    return () => { vivo = false; };
  }, []);
  return custom;
}

// Convierte una categoría personalizada a la forma del catálogo en cascada.
// Las subcategorías/materiales se capturan con "Otro (escribir)" del selector.
export function customACascada(c) {
  return { value: c.nombre, label: c.nombre, subcategorias: [{ value: "General", label: "General", materiales: [] }] };
}

// Fusiona categorías personalizadas con una lista en cascada (solo las de unidades)
export function fusionarCascada(categoriasBase, custom) {
  const extra = (custom || []).filter((c) => c.medida !== "kg").map(customACascada);
  const existentes = new Set(categoriasBase.map((c) => c.value));
  return [...categoriasBase, ...extra.filter((c) => !existentes.has(c.value))];
}

// Fusiona las personalizadas de tipo kg con la lista de materiales por peso
export function fusionarPeso(materialesPesoBase, custom) {
  const extra = (custom || []).filter((c) => c.medida === "kg").map((c) => ({ value: c.nombre, label: c.nombre }));
  const existentes = new Set(materialesPesoBase.map((m) => m.value));
  return [...materialesPesoBase, ...extra.filter((m) => !existentes.has(m.value))];
}

// Lista plana (para selects de stock/ventas): [{value, label, medida}]
export function fusionarFlat(flatBase, custom) {
  const extra = (custom || []).map((c) => ({ value: c.nombre, label: c.nombre, medida: c.medida || "unidades" }));
  const existentes = new Set(flatBase.map((c) => c.value));
  return [...flatBase, ...extra.filter((c) => !existentes.has(c.value))];
}
