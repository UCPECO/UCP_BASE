import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Loader2, CheckCircle2, Star } from "lucide-react";
import SectionCard from "@/components/ucp/SectionCard";
import EmptyState from "@/components/ucp/EmptyState";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { nombreUsuario } from "@/lib/ucpUtils";

export default function AlumnoEncuestas() {
  const { toast } = useToast();
  const [perfil, setPerfil] = useState(null);
  const [encuestas, setEncuestas] = useState([]);
  const [respondidas, setRespondidas] = useState([]);
  const [respuestas, setRespuestas] = useState({});
  const [enviando, setEnviando] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(async (p) => {
      setPerfil(p);
      try {
        const lista = await base44.entities.Encuestas.filter({ activa: true });
        setEncuestas(lista);
        const res = await base44.entities.Respuestas_Encuesta.filter({ usuario: p.id });
        setRespondidas(res.map((r) => r.encuesta));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, []);

  const yaRespondi = (id) => respondidas.includes(id);

  const responder = async (enc) => {
    setEnviando(enc.id);
    try {
      const resp = enc.preguntas.map((p, i) => ({ pregunta: i, valor: respuestas[enc.id + "_" + i] }));
      if (resp.some((r) => r.valor == null || r.valor === "")) {
        toast({ title: "Responde todas las preguntas", variant: "destructive" });
        setEnviando(null);
        return;
      }
      await base44.entities.Respuestas_Encuesta.create({
        encuesta: enc.id,
        encuesta_titulo: enc.titulo,
        usuario: perfil.id,
        usuario_nombre: nombreUsuario(perfil),
        area: perfil.area_asignada || "",
        respuestas: resp,
        fecha: new Date().toISOString(),
      });
      setRespondidas((prev) => [...prev, enc.id]);
      toast({ title: "Respuesta enviada. ¡Gracias!" });
    } catch (e) {
      toast({ title: "Error al enviar", variant: "destructive" });
    } finally {
      setEnviando(null);
    }
  };

  const setResp = (encId, pi, valor) => setRespuestas((r) => ({ ...r, [encId + "_" + pi]: valor }));

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 text-primary animate-spin" /></div>;

  const pendientes = encuestas.filter((e) => !yaRespondi(e.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold font-heading flex items-center gap-2">
          <ClipboardList className="h-7 w-7 text-primary" /> Encuestas
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Tu opinión nos ayuda a mejorar el programa.</p>
      </div>

      {pendientes.length === 0 ? (
        <SectionCard title="Encuestas disponibles">
          <EmptyState title="Sin encuestas pendientes" message="No tienes encuestas por responder en este momento." icon={CheckCircle2} />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          {pendientes.map((enc) => (
            <SectionCard key={enc.id} title={enc.titulo} subtitle={enc.descripcion}>
              <div className="space-y-5">
                {enc.preguntas.map((p, pi) => (
                  <div key={pi} className="space-y-2">
                    <p className="font-medium text-sm">{pi + 1}. {p.texto}</p>
                    {p.tipo === "escala_1_5" && (
                      <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} onClick={() => setResp(enc.id, pi, n)}
                            className={"h-9 w-9 rounded-lg border flex items-center justify-center text-sm font-medium transition-colors " +
                              (respuestas[enc.id + "_" + pi] === n ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>
                            {n}
                          </button>
                        ))}
                        <Star className="h-4 w-4 text-amber-500 ml-1" />
                      </div>
                    )}
                    {p.tipo === "opcion_multiple" && (
                      <div className="space-y-1.5">
                        {(p.opciones || []).map((op) => (
                          <label key={op} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="radio" name={enc.id + "_" + pi} value={op} onChange={(e) => setResp(enc.id, pi, e.target.value)} />
                            {op}
                          </label>
                        ))}
                      </div>
                    )}
                    {p.tipo === "texto" && (
                      <textarea className="w-full rounded-md border border-input bg-transparent p-2 text-sm" rows={2} onChange={(e) => setResp(enc.id, pi, e.target.value)} placeholder="Tu respuesta..." />
                    )}
                  </div>
                ))}
                <Button onClick={() => responder(enc)} disabled={enviando === enc.id} className="bg-primary text-primary-foreground">
                  {enviando === enc.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Enviar respuestas
                </Button>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </div>
  );
}