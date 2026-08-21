import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, LineChart, Line, Legend, Cell } from "recharts";
import { BarChart3, TrendingUp } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import { useIsMobile } from "@/hooks/use-mobile";

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const COLORES = ["hsl(168 58% 34%)", "hsl(35 85% 55%)", "hsl(200 70% 50%)", "hsl(280 60% 55%)", "hsl(340 70% 55%)", "hsl(168 48% 45%)"];

export default function GraficosBodega({ registros, categorias, catMedida, catLabel }) {
  const esMovil = useIsMobile();
  const porCategoria = useMemo(() => {
    return categorias
      .map((c) => {
        const regs = registros.filter(r => r.categoria === c.value);
        const cantidad = regs.reduce((a, r) => a + (r.cantidad || 0), 0);
        return {
          name: catLabel[c.value] || c.value,
          registros: regs.length,
          cantidad,
          medida: catMedida[c.value] || "unidades",
        };
      })
      .filter(d => d.registros > 0);
  }, [registros, categorias, catMedida, catLabel]);

  const mensual = useMemo(() => {
    const now = new Date();
    const arr = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth(); const y = d.getFullYear();
      const enMes = registros.filter(r => {
        const f = new Date(r.fecha_recepcion);
        return f.getMonth() === m && f.getFullYear() === y;
      });
      const peso = enMes.filter(r => (r.medida || catMedida[r.categoria]) === "kg").reduce((a, r) => a + (r.cantidad || 0), 0);
      arr.push({ name: `${MESES[m]} ${String(y).slice(2)}`, registros: enMes.length, peso: Math.round(peso * 100) / 100 });
    }
    return arr;
  }, [registros, catMedida]);

  const totalRegs = registros.length;

  if (totalRegs === 0) return null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <SectionCard title="Volumen por categoría" subtitle="Registros recibidos por tipo de material" icon={BarChart3}>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porCategoria} margin={{ top: 10, right: 10, left: esMovil ? -22 : -10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(150 18% 88%)" />
              <XAxis dataKey="name" tick={{ fontSize: esMovil ? 9 : 10, fill: "hsl(168 15% 42%)" }} angle={esMovil ? -40 : -25} textAnchor="end" height={70} interval={0} />
              <YAxis tick={{ fontSize: esMovil ? 10 : 11, fill: "hsl(168 15% 42%)" }} allowDecimals={false} width={esMovil ? 26 : 36} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid hsl(150 18% 88%)", fontSize: 12 }}
                formatter={(v, n, p) => [`${v} registros`, "Registros"]}
                labelFormatter={(l) => l}
              />
              <Bar dataKey="registros" radius={[6, 6, 0, 0]}>
                {porCategoria.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Recepción mensual" subtitle="Últimos 12 meses · registros y peso (kg)" icon={TrendingUp}>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mensual} margin={{ top: 10, right: 10, left: esMovil ? -22 : -10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(150 18% 88%)" />
              <XAxis dataKey="name" tick={{ fontSize: esMovil ? 9 : 10, fill: "hsl(168 15% 42%)" }} />
              <YAxis tick={{ fontSize: esMovil ? 10 : 11, fill: "hsl(168 15% 42%)" }} allowDecimals={false} width={esMovil ? 26 : 36} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(150 18% 88%)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: esMovil ? 11 : 12 }} />
              <Line type="monotone" dataKey="registros" name="Registros" stroke="hsl(168 58% 34%)" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="peso" name="Peso (kg)" stroke="hsl(35 85% 55%)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}