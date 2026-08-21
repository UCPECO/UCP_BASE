import React, { useMemo } from "react";

function fechaLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function isoDe(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const NIVELES = [
  "bg-muted",                          // sin fichaje
  "bg-primary/25",
  "bg-primary/50",
  "bg-primary/80",
  "bg-primary",                        // día intenso
];

// Heatmap de asistencia tipo GitHub: de un vistazo se ve la constancia.
// Últimas `semanas` semanas, columnas = semanas, filas = lunes a domingo.
export default function HeatmapAsistencia({ registros, semanas = 16 }) {
  const { celdas, diasActivos } = useMemo(() => {
    const horasPorDia = {};
    (registros || []).forEach((r) => {
      if (!r.fecha) return;
      let h = 0;
      if (r.hora_entrada && r.hora_salida) {
        const [h1, m1] = r.hora_entrada.split(":").map(Number);
        const [h2, m2] = r.hora_salida.split(":").map(Number);
        let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
        if (mins < 0) mins += 24 * 60;
        h = mins / 60;
      }
      horasPorDia[r.fecha] = (horasPorDia[r.fecha] || 0) + h;
    });

    const hoy = new Date();
    const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    // Arrancamos en el lunes de la primera semana del rango
    const inicio = new Date(fin);
    inicio.setDate(inicio.getDate() - (semanas * 7 - 1));
    inicio.setDate(inicio.getDate() - ((inicio.getDay() + 6) % 7));

    const celdas = [];
    let activos = 0;
    for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
      const iso = isoDe(d);
      const h = horasPorDia[iso] || 0;
      if (h > 0) activos++;
      const nivel = h === 0 ? 0 : h < 2 ? 1 : h < 4 ? 2 : h < 6 ? 3 : 4;
      celdas.push({ iso, nivel, horas: Math.round(h * 100) / 100 });
    }
    return { celdas, diasActivos: activos };
  }, [registros, semanas]);

  const semanasCount = Math.ceil(celdas.length / 7);

  return (
    <div>
      <div className="overflow-x-auto scrollbar-thin pb-1">
        <div
          className="grid grid-rows-7 grid-flow-col gap-[3px] w-max"
          style={{ gridTemplateColumns: `repeat(${semanasCount}, minmax(0, 1fr))` }}
        >
          {celdas.map((c) => (
            <div
              key={c.iso}
              title={`${c.iso}${c.horas > 0 ? ` · ${c.horas} h` : " · sin fichaje"}`}
              className={`h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-[4px] ${NIVELES[c.nivel]} transition-transform hover:scale-125`}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3 text-[11px] text-muted-foreground">
        <span>{diasActivos} {diasActivos === 1 ? "día activo" : "días activos"} en las últimas {semanas} semanas</span>
        <span className="flex items-center gap-1">
          Menos
          {NIVELES.map((n, i) => <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${n}`} />)}
          Más
        </span>
      </div>
    </div>
  );
}
