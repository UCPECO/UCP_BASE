// Cierra un fichaje (Registros_QR) y, cuando corresponde, genera una incidencia
// con el comentario del admin/encargado como motivo. Usado por AdminRegistros y
// EncargadoRegistros para que el cierre manual quede documentado como incidencia.

import { base44 } from "@/api/base44Client";

const HORA_LIMITE_MIN = 17 * 60 + 15; // 17:15
const ROLES_PARTICIPANTE = ["voluntario", "servicio_social"];

function aMinutos(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

export async function cerrarRegistroConIncidencia({ registro, salida, horas, comentario, rolUsuario, modificadoPor }) {
  await base44.entities.Registros_QR.update(registro.id, {
    hora_salida: salida,
    estado_registro: "cerrado",
    comentario_admin: comentario || undefined,
    modificado_por: modificadoPor,
    fecha_modificacion: new Date().toISOString(),
  });

  const motivo = comentario && comentario.trim() ? ` Motivo del cierre: ${comentario.trim()}` : "";
  const minSalida = aMinutos(salida);
  const esParticipante = ROLES_PARTICIPANTE.includes(rolUsuario);
  const fueraDeHorario = esParticipante && minSalida != null && minSalida > HORA_LIMITE_MIN;

  if (!fueraDeHorario && !motivo) return { incidenciaGenerada: false };

  const tipo = fueraDeHorario ? "incumplimiento" : "otro";
  const descripcion = fueraDeHorario
    ? `Fichaje cerrado por encargado/admin rebasando las 17:15 (salida a las ${salida}). Horas registradas: ${horas}h.${motivo}`
    : `Fichaje cerrado por encargado/admin (salida ${salida}, ${horas}h).${motivo}`;

  await base44.entities.Incidencias.create({
    tipo_incidencia: tipo,
    usuario_afectado: registro.usuario,
    asignacion: registro.asignacion || null,
    registro: registro.id,
    descripcion,
    prioridad: "media",
    estado_incidencia: "reportada",
    creado_por: modificadoPor,
  });

  return { incidenciaGenerada: true };
}