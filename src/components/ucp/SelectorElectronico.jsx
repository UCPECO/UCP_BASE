import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { CATEGORIAS_ELECTRONICOS, MATERIALES_PESO } from "@/lib/catalogoElectronicos";
import { useCategoriasCustom, fusionarCascada, fusionarPeso } from "@/lib/categoriasDinamicas";

// Selector en cascada de dos grupos:
//  - procesado (kg): lista de materiales por peso (materialesPeso)
//  - articulo (u): Categoría → Subcategoría → Material (del catálogo categorias)
// Cada nivel permite "Otro (escribir)" para capturar materiales que no están
// en el catálogo — el texto libre se guarda tal cual en el registro.
// Además se fusionan las categorías personalizadas creadas por el admin.
// `value` es la línea actual; `onChange(patch)` fusiona el patch en la línea.
export default function SelectorElectronico({ value, onChange, categorias, materialesPeso }) {
  const custom = useCategoriasCustom();
  const categoriasFinal = fusionarCascada(categorias || CATEGORIAS_ELECTRONICOS, custom);
  const pesoFinal = fusionarPeso(materialesPeso || MATERIALES_PESO, custom);
  const tipo = value.tipo_registro || "articulo";
  const categoria = value.categoria || "";
  const subcategoria = value.subcategoria || "";
  const material = value.material || "";
  const catObj = categoriasFinal.find((c) => c.value === categoria);
  const subObj = catObj?.subcategorias.find((s) => s.value === subcategoria);
  const medida = tipo === "procesado" ? "kg" : "unidades";

  // Modo "otro" por nivel: true = campo de texto libre en lugar del select
  const [customCat, setCustomCat] = useState(false);
  const [customSub, setCustomSub] = useState(false);
  const [customMat, setCustomMat] = useState(false);

  const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const btnVolver = (onClick) => (
    <button type="button" onClick={onClick} className="text-[11px] text-primary hover:underline whitespace-nowrap" title="Volver a la lista del catálogo">
      ← lista
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={`${sel} w-36`}
        value={tipo}
        onChange={(e) => { setCustomCat(false); setCustomSub(false); setCustomMat(false); onChange({ tipo_registro: e.target.value, categoria: "", subcategoria: "", material: "" }); }}
      >
        <option value="articulo">Artículo (u)</option>
        <option value="procesado">Procesado (kg)</option>
      </select>

      {tipo === "procesado" ? (
        <select className={`${sel} flex-1 min-w-[150px]`} value={categoria} onChange={(e) => onChange({ categoria: e.target.value })}>
          <option value="">Material…</option>
          {pesoFinal.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      ) : customCat ? (
        <>
          <Input className="h-9 flex-1 min-w-[130px]" placeholder="Categoría nueva…" value={categoria} onChange={(e) => onChange({ categoria: e.target.value })} />
          {btnVolver(() => { setCustomCat(false); onChange({ categoria: "", subcategoria: "", material: "" }); })}
          <Input className="h-9 flex-1 min-w-[130px]" placeholder="Subcategoría…" value={subcategoria} onChange={(e) => onChange({ subcategoria: e.target.value })} />
          <Input className="h-9 flex-1 min-w-[130px]" placeholder="Material…" value={material} onChange={(e) => onChange({ material: e.target.value })} />
        </>
      ) : (
        <>
          <select
            className={`${sel} flex-1 min-w-[150px]`}
            value={categoria}
            onChange={(e) => {
              if (e.target.value === "__otra__") { setCustomCat(true); onChange({ categoria: "", subcategoria: "", material: "" }); }
              else { setCustomSub(false); setCustomMat(false); onChange({ categoria: e.target.value, subcategoria: "", material: "" }); }
            }}
          >
            <option value="">Categoría…</option>
            {categoriasFinal.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
            <option value="__otra__">✏️ Otra (escribir)…</option>
          </select>

          {customSub ? (
            <>
              <Input className="h-9 flex-1 min-w-[130px]" placeholder="Subcategoría nueva…" value={subcategoria} onChange={(e) => onChange({ subcategoria: e.target.value, material: "" })} />
              {btnVolver(() => { setCustomSub(false); onChange({ subcategoria: "", material: "" }); })}
            </>
          ) : (
            <select
              className={`${sel} flex-1 min-w-[150px]`}
              value={subcategoria}
              disabled={!catObj}
              onChange={(e) => {
                if (e.target.value === "__otra__") { setCustomSub(true); onChange({ subcategoria: "", material: "" }); }
                else { setCustomMat(false); onChange({ subcategoria: e.target.value, material: "" }); }
              }}
            >
              <option value="">Subcategoría…</option>
              {catObj?.subcategorias.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
              {catObj && <option value="__otra__">✏️ Otra (escribir)…</option>}
            </select>
          )}

          {customMat || customSub ? (
            <>
              <Input className="h-9 flex-1 min-w-[130px]" placeholder="Material…" value={material} onChange={(e) => onChange({ material: e.target.value })} />
              {customMat && btnVolver(() => { setCustomMat(false); onChange({ material: "" }); })}
            </>
          ) : (
            <select
              className={`${sel} flex-1 min-w-[150px]`}
              value={material}
              disabled={!subObj}
              onChange={(e) => {
                if (e.target.value === "__otro__") { setCustomMat(true); onChange({ material: "" }); }
                else onChange({ material: e.target.value });
              }}
            >
              <option value="">Material…</option>
              {subObj?.materiales.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {subObj && <option value="__otro__">✏️ Otro (escribir)…</option>}
            </select>
          )}
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
