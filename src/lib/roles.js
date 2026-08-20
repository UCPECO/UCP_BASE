// Roles del sistema. Los "participantes" son quienes fichan horas y reciben
// constancia: servicio social, voluntariado y prácticas profesionales.
export const ROLES_PARTICIPANTE = ["servicio_social", "voluntario", "practicas_profesionales"];

export const esParticipante = (role) => ROLES_PARTICIPANTE.includes(role);

export const ROL_LABEL = {
  admin: "Administrador",
  encargado: "Encargado",
  servicio_social: "Servicio Social",
  voluntario: "Voluntario",
  practicas_profesionales: "Prácticas Profesionales",
};

export const labelRol = (r) => ROL_LABEL[r] || (r || "").replace(/_/g, " ") || "—";

// Catálogo para selects de tipo de participante
export const TIPOS_PARTICIPANTE = [
  { value: "servicio_social", label: "Servicio Social" },
  { value: "voluntario", label: "Voluntario" },
  { value: "practicas_profesionales", label: "Prácticas Profesionales" },
];
