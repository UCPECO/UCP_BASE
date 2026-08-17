import { base44 } from "@/api/base44Client";
import { nombreUsuario } from "@/lib/ucpUtils";

// Registra una acción en la bitácora de auditoría (append-only).
// Se llama desde los flujos críticos del sistema (constancias, evidencias, etc.).
export async function registrarBitacora(accion, modulo, detalle = "") {
  try {
    const perfil = await base44.auth.me();
    if (!perfil) return;
    await base44.entities.Bitacora_Auditoria.create({
      usuario: perfil.id,
      usuario_nombre: nombreUsuario(perfil),
      accion,
      modulo,
      detalle,
      fecha: new Date().toISOString(),
    });
  } catch (e) {
    // La bitácora nunca debe romper el flujo principal
    console.error("Error registrando bitácora:", e);
  }
}