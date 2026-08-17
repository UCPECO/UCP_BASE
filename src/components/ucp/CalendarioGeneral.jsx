import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatearFecha } from "@/lib/ucpUtils";

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const COLOR_EVENTO = {
  azul: "bg-blue-500", verde: "bg-emerald-500", rojo: "bg-rose-500",
  amarillo: "bg-amber-500", morado: "bg-purple-500", naranja: "bg-orange-500",
};

export default function CalendarioGeneral({ eventos = [] }) {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [diaSel, setDiaSel] = useState(null);

  const primerDia = new Date(anio, mes, 1);
  let inicioSemana = primerDia.getDay();
  inicioSemana = inicioSemana === 0 ? 6 : inicioSemana - 1;
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const eventosMes = useMemo(() => eventos.filter(e => {
    const f = new Date(e.fecha);
    return f.getMonth() === mes && f.getFullYear() === anio;
  }), [eventos, mes, anio]);

  const porDia = useMemo(() => {
    const m = {};
    eventosMes.forEach(e => { const d = new Date(e.fecha).getDate(); if (!m[d]) m[d] = []; m[d].push(e); });
    return m;
  }, [eventosMes]);

  const celdas = [];
  for (let i = 0; i < inicioSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);

  const cambiar = (delta) => {
    let m = mes + delta, a = anio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    setMes(m); setAnio(a); setDiaSel(null);
  };

  const eventosSel = diaSel ? (porDia[diaSel] || []) : [];

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => cambiar(-1)} className="p-1.5 hover:bg-muted rounded-lg"><ChevronLeft className="h-5 w-5" /></button>
        <h3 className="font-semibold font-heading text-lg">{MESES[mes]} {anio}</h3>
        <button onClick={() => cambiar(1)} className="p-1.5 hover:bg-muted rounded-lg"><ChevronRight className="h-5 w-5" /></button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS.map(d => <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>)}
        {celdas.map((d, i) => {
          if (d === null) return <div key={i} />;
          const esHoy = d === hoy.getDate() && mes === hoy.getMonth() && anio === hoy.getFullYear();
          const evs = porDia[d] || [];
          const sel = diaSel === d;
          return (
            <button
              key={i}
              onClick={() => setDiaSel(d)}
              className={`aspect-square sm:aspect-[4/3] rounded-lg text-sm flex flex-col items-center justify-center relative transition-colors border p-1
                ${sel ? "bg-emerald-600 text-white border-emerald-600" :
                  esHoy ? "bg-emerald-50 border-emerald-300 font-bold" :
                  "border-transparent hover:bg-muted"}`}
            >
              <span>{d}</span>
              <div className="flex gap-0.5 mt-1 flex-wrap justify-center">
                {evs.slice(0, 4).map((e, idx) => (
                  <span key={idx} className={`h-1.5 w-1.5 rounded-full ${COLOR_EVENTO[e.color] || "bg-blue-500"}`} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {diaSel && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm font-semibold mb-2">
            {formatearFecha(`${anio}-${String(mes + 1).padStart(2, "0")}-${String(diaSel).padStart(2, "0")}`)}
          </p>
          {eventosSel.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos este día.</p>
          ) : (
            <div className="space-y-2">
              {eventosSel.map(e => (
                <div key={e.id} className="flex items-start gap-2 text-sm bg-secondary rounded-lg px-3 py-2">
                  <span className={`h-2.5 w-2.5 rounded-full mt-1 shrink-0 ${COLOR_EVENTO[e.color] || "bg-blue-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{e.titulo}</p>
                    <p className="text-xs text-muted-foreground">{e.hora_inicio}–{e.hora_fin}{e.ubicacion ? ` · ${e.ubicacion}` : ""}</p>
                    {e.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{e.descripcion}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}