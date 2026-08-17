// Catálogo de materiales de reciclaje electrónico (172 materiales en 10 categorías).
// Generado desde el CSV del usuario. Los artículos se miden en unidades.
export const CATEGORIAS_ELECTRONICOS = [
  {
    value: "Computadoras y Periféricos",
    label: "Computadoras y Periféricos",
    subcategorias: [
      { value: "Equipos de Cómputo", label: "Equipos de Cómputo", materiales: ["PC de Escritorio","Laptop","Tablet","Servidor","Estación de Trabajo","Netbook"] },
      { value: "Monitores y Pantallas", label: "Monitores y Pantallas", materiales: ["Monitor CRT","Monitor LCD","Monitor LED","Pantalla Táctil","Panel de Visualización"] },
      { value: "Periféricos de Entrada", label: "Periféricos de Entrada", materiales: ["Teclado","Mouse","Webcam","Escáner","Lector de Código de Barras","Micrófono"] },
      { value: "Periféricos de Salida", label: "Periféricos de Salida", materiales: ["Impresora Láser","Impresora Inyección de Tinta","Impresora Matricial","Plotter","Multifuncional","Proyector"] },
      { value: "Componentes Internos", label: "Componentes Internos", materiales: ["Tarjeta Madre","CPU","GPU","RAM","Disco Duro HDD","Disco SSD","Fuente de Poder","Tarjeta de Red","Tarjeta de Sonido"] },
    ],
  },
  {
    value: "Telecomunicaciones",
    label: "Telecomunicaciones",
    subcategorias: [
      { value: "Teléfonos Móviles", label: "Teléfonos Móviles", materiales: ["Smartphone","Celular Básico","Teléfono Inteligente"] },
      { value: "Teléfonos Fijos", label: "Teléfonos Fijos", materiales: ["Teléfono Analógico","Teléfono Inalámbrico","Teléfono con Cable","Central Telefónica"] },
      { value: "Equipos de Red", label: "Equipos de Red", materiales: ["Router","Switch","Hub","Módem","Access Point","Antena","Repetidor WiFi"] },
      { value: "Comunicación Empresarial", label: "Comunicación Empresarial", materiales: ["Sistema PBX","Videoconferencia","Intercomunicador"] },
    ],
  },
  {
    value: "Audio Video y Entretenimiento",
    label: "Audio Video y Entretenimiento",
    subcategorias: [
      { value: "Televisores", label: "Televisores", materiales: ["TV CRT","TV Plasma","TV LCD","TV LED","TV OLED","TV QLED","Smart TV"] },
      { value: "Reproductores de Video", label: "Reproductores de Video", materiales: ["DVD Player","Blu-ray Player","VHS Player","Reproductor Multimedia"] },
      { value: "Sistemas de Audio", label: "Sistemas de Audio", materiales: ["Equipo de Sonido","Bocina","Amplificador","Consola de Mezcla","Microcomponente"] },
      { value: "Consolas de Videojuegos", label: "Consolas de Videojuegos", materiales: ["PlayStation","Xbox","Nintendo","Control de Videojuegos","Accesorios de Consola"] },
      { value: "Cámaras", label: "Cámaras", materiales: ["Cámara Digital","Cámara Analógica","Videocámara","Cámara de Seguridad","GoPro"] },
      { value: "Reproductores de Música", label: "Reproductores de Música", materiales: ["iPod","MP3 Player","Discman","Walkman"] },
    ],
  },
  {
    value: "Equipos de Oficina",
    label: "Equipos de Oficina",
    subcategorias: [
      { value: "Equipos de Impresión y Copiado", label: "Equipos de Impresión y Copiado", materiales: ["Fotocopiadora","Impresora Industrial","Encuadernadora","Guillotina Eléctrica"] },
      { value: "Máquinas de Oficina", label: "Máquinas de Oficina", materiales: ["Calculadora Electrónica","Destructora de Papel","Enfriador de Agua"] },
      { value: "Equipos de Conferencia", label: "Equipos de Conferencia", materiales: ["Teléfono de Conferencia","Pantalla Interactiva","Pizarra Electrónica"] },
    ],
  },
  {
    value: "Electrodomésticos Pequeños",
    label: "Electrodomésticos Pequeños",
    subcategorias: [
      { value: "Cocina", label: "Cocina", materiales: ["Microondas","Licuadora","Batidora","Procesador de Alimentos","Cafetera Eléctrica","Tostadora","Plancha","Olla Arrocera"] },
      { value: "Cuidado Personal", label: "Cuidado Personal", materiales: ["Secadora de Cabello","Plancha para Cabello","Rasuradora Eléctrica","Cepillo Eléctrico","Báscula Digital"] },
      { value: "Limpieza", label: "Limpieza", materiales: ["Aspiradora","Robot Aspirador"] },
      { value: "Climatización Pequeña", label: "Climatización Pequeña", materiales: ["Ventilador","Humidificador","Deshumidificador","Calentador Eléctrico Portátil"] },
    ],
  },
  {
    value: "Equipos Industriales y Médicos",
    label: "Equipos Industriales y Médicos",
    subcategorias: [
      { value: "Maquinaria Industrial", label: "Maquinaria Industrial", materiales: ["PLC","Variador de Frecuencia","CNC","Robot Industrial","Sensor Electrónico"] },
      { value: "Equipos Médicos", label: "Equipos Médicos", materiales: ["Electrocardiógrafo","Monitor de Signos Vitales","Ultrasonido Portátil","Desfibrilador","Incubadora","Equipo de Laboratorio"] },
      { value: "Instrumentos de Medición", label: "Instrumentos de Medición", materiales: ["Multímetro","Osciloscopio","Analizador","Herramienta de Diagnóstico Automotriz"] },
    ],
  },
  {
    value: "Iluminación y Energía",
    label: "Iluminación y Energía",
    subcategorias: [
      { value: "Iluminación", label: "Iluminación", materiales: ["Foco LED","Tubo Fluorescente","Lámpara de Bajo Consumo","Balastro Electrónico"] },
      { value: "Energía", label: "Energía", materiales: ["Panel Solar Fotovoltaico","Inversor Solar","Controlador de Carga","UPS","Regulador de Voltaje"] },
    ],
  },
  {
    value: "Cables Conectores y Accesorios",
    label: "Cables Conectores y Accesorios",
    subcategorias: [
      { value: "Cables", label: "Cables", materiales: ["HDMI","USB","VGA","DVI","DisplayPort","Ethernet","Coaxial","RCA","Cable de Poder","Cable de Carga"] },
      { value: "Adaptadores y Cargadores", label: "Adaptadores y Cargadores", materiales: ["Cargador de Celular","Adaptador de Corriente","Power Bank","Hub USB"] },
      { value: "Conectores y Componentes Pasivos", label: "Conectores y Componentes Pasivos", materiales: ["Regleta Eléctrica","Extensión Eléctrica","Jack","Conector Diverso"] },
    ],
  },
  {
    value: "Baterías y Pilas",
    label: "Baterías y Pilas",
    subcategorias: [
      { value: "Baterías Recargables", label: "Baterías Recargables", materiales: ["Batería Li-Ion","Batería Li-Po","Batería NiCd","Batería NiMH"] },
      { value: "Baterías de Plomo-Ácido", label: "Baterías de Plomo-Ácido", materiales: ["Batería UPS","Batería de Alarma","Batería de Respaldo"] },
      { value: "Pilas", label: "Pilas", materiales: ["Pila Alcalina","Pila Botón","Pila de Litio"] },
    ],
  },
  {
    value: "Residuos de Procesamiento",
    label: "Residuos de Procesamiento",
    subcategorias: [
      { value: "Placas de Circuito", label: "Placas de Circuito", materiales: ["PCB General","PCB de Computadora","PCB de Celular"] },
      { value: "Chatarra Electrónica", label: "Chatarra Electrónica", materiales: ["Componentes Sueltos","Conectores Varios","Transformador","Relé"] },
      { value: "Plásticos con Retardantes", label: "Plásticos con Retardantes", materiales: ["Carcasa de Equipo","Carcasa de Monitor"] },
      { value: "Metales Ferrosos y No Ferrosos", label: "Metales Ferrosos y No Ferrosos", materiales: ["Marco Metálico","Disipador de Calor","Blindaje Metálico"] },
    ],
  },
];

// Materiales procesados medidos por peso (kg)
export const MATERIALES_PESO = [
  { value: "cobre", label: "Cobre" },
  { value: "aluminio", label: "Aluminio" },
  { value: "hierro", label: "Hierro" },
  { value: "plastico_triturado", label: "Plástico triturado" },
  { value: "placas_pcb", label: "Placas PCB" },
];

// Lista plana para reportes / resúmenes: peso (kg) + categorías de artículos (unidades)
export const CATEGORIAS_FLAT = [
  ...MATERIALES_PESO.map(m => ({ ...m, medida: "kg" })),
  ...CATEGORIAS_ELECTRONICOS.map(c => ({ value: c.value, label: c.label, medida: "unidades" })),
];

export const CAT_LABEL = Object.fromEntries(CATEGORIAS_FLAT.map(c => [c.value, c.label]));
export const CAT_MEDIDA = Object.fromEntries(CATEGORIAS_FLAT.map(c => [c.value, c.medida]));
export const MEDIDA_LABEL = { kg: "kg", unidades: "u" };

// Etiqueta legible de una categoría (peso o artículo)
export function labelCategoria(cat) {
  return CAT_LABEL[cat] || cat || "—";
}

// Medida de un registro: los procesados siempre son kg; los artículos, unidades
export function medidaDeRegistro(m) {
  if (m.tipo_registro === "procesado") return "kg";
  return m.medida || "unidades";
}