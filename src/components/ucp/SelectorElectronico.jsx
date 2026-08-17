import React from "react";
import { Input } from "@/components/ui/input";
import { CATEGORIAS_ELECTRONICOS, MATERIALES_PESO } from "@/lib/catalogoElectronicos";

// Selector en cascada de dos grupos:
//  - procesado (kg): lista de materiales por peso (materialesPeso)
//  - articulo (u): Categoría → Subcategoría → Material (del catálogo categorias)
// `value` es la línea actual; `onChange(patch)` fusiona el patch en la línea.
export default function SelectorElectronico({ value, onChange, categorias = CATEGORIAS_ELECTRONICOS, materialesPeso = MATERIALES_PESO }) {
  const tipo = value.tipo_registro || "articulo";
  const categoria = value.categoria || "";
  const subcategoria = value.subcategoria || "";
  const material = value.material || "";
  const catObj = categorias.find((c) => c.value === categoria);
  const subObj = catObj?.subcategorias.find((s) => s.value === subcategoria);
  const medida = tipo === "procesado" ? "kg" : "unidades";

  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={`${sel} w-36`}
        value={tipo}
        onChange={(e) => onChange({ tipo_registro: e.target.value, categoria: "", subcategoria: "", material: "" })}
      >
        <option value="articulo">Artículo (u)</option>
        <option value="procesado">Procesado (kg)</option>
      </select>

      {tipo === "procesado" ? (
        <select className={`${sel} flex-1 min-w-[150px]`} value={categoria} onChange={(e) => onChange({ categoria: e.target.value })}>
          <option value="">Material…</option>
          {materialesPeso.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      ) : (
        <>
          <select
            className={`${sel} flex-1 min-w-[150px]`}
            value={categoria}
            onChange={(e) => onChange({ categoria: e.target.value, subcategoria: "", material: "" })}
          >
            <option value="">Categoría…</option>
            {categorias.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <select
            className={`${sel} flex-1 min-w-[150px]`}
            value={subcategoria}
            disabled={!catObj}
            onChange={(e) => onChange({ subcategoria: e.target.value, material: "" })}
          >
            <option value="">Subcategoría…</option>
            {catObj?.subcategorias.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            className={`${sel} flex-1 min-w-[150px]`}
            value={material}
            disabled={!subObj}
            onChange={(e) => onChange({ material: e.target.value })}
          >
            <option value="">Material…</option>
            {subObj?.materiales.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={medida === "kg" ? "0.1" : "1"}
          step={medida === "kg" ? "0.1" : "1"}
          className="h-9 w-20"
          value={value.cantidad}
          onChange={(e) => onChange({ cantidad: e.target.value })}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{medida === "kg" ? "kg" : "u"}</span>
      </div>
    </div>
  );
}