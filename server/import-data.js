import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');

// CSV Parser robusto que maneja comillas, comas dentro de campos, y saltos de línea
function parseCSV(content) {
  const lines = [];
  let currentLine = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentLine.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentField !== '' || currentLine.length > 0) {
        currentLine.push(currentField.trim());
        if (currentLine.some(f => f !== '')) {
          lines.push(currentLine);
        }
        currentLine = [];
        currentField = '';
      }
      // Skip \r\n
      if (char === '\r' && nextChar === '\n') i++;
    } else {
      currentField += char;
    }
  }
  
  // Don't forget the last field/line
  if (currentField !== '' || currentLine.length > 0) {
    currentLine.push(currentField.trim());
    if (currentLine.some(f => f !== '')) {
      lines.push(currentLine);
    }
  }
  
  if (lines.length === 0) return { headers: [], rows: [] };
  
  const headers = lines[0].map(h => h.replace(/^"|"$/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = line[index] !== undefined ? line[index].replace(/^"|"$/g, '') : '';
    });
    return obj;
  });
  
  return { headers, rows };
}

function convertValue(value, type) {
  if (value === '' || value === null || value === undefined) return null;
  
  switch (type) {
    case 'boolean':
      return value === 'true' || value === '1' ? 1 : 0;
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    case 'integer':
      const int = parseInt(value, 10);
      return isNaN(int) ? null : int;
    case 'date':
      // SQLite datetime format
      if (!value) return null;
      try {
        const d = new Date(value);
        if (isNaN(d.getTime())) return value; // return as-is if invalid
        return d.toISOString();
      } catch {
        return value;
      }
    default:
      return value;
  }
}

// Mapeo de columnas CSV -> columnas DB, con tipos
const entityMappings = {
  'Actividades': {
    table: 'actividades',
    columns: {
      id: { db: 'id', type: 'string' },
      nombre: { db: 'nombre', type: 'string' },
      descripcion: { db: 'descripcion', type: 'string' },
      categoria: { db: 'categoria', type: 'string' },
      activo: { db: 'activo', type: 'boolean' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Asignaciones': {
    table: 'asignaciones',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      actividad: { db: 'actividad', type: 'string' },
      estado: { db: 'estado', type: 'string' },
      fecha_inicio: { db: 'fecha_inicio', type: 'string' },
      fecha_fin_estimada: { db: 'fecha_fin', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Registros_QR': {
    table: 'registros_qr',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      asignacion: { db: 'asignacion', type: 'string' },
      fecha: { db: 'fecha', type: 'string' },
      hora_entrada: { db: 'hora_entrada', type: 'string' },
      hora_salida: { db: 'hora_salida', type: 'string' },
      estado_registro: { db: 'estado_registro', type: 'string' },
      fecha_modificacion: { db: 'fecha_modificacion', type: 'date' },
      comentario_admin: { db: 'comentario_admin', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Evidencias': {
    table: 'evidencias',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      actividad: { db: 'actividad', type: 'string' },
      asignacion: { db: 'asignacion', type: 'string' },
      titulo: { db: 'titulo', type: 'string' },
      descripcion: { db: 'descripcion', type: 'string' },
      archivo_url: { db: 'archivo_url', type: 'string' },
      estado_evidencia: { db: 'estado_evidencia', type: 'string' },
      aprobado_por: { db: 'aprobado_por', type: 'string' },
      comentario_revision: { db: 'comentario_revision', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Bonos': {
    table: 'bonos',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      asignacion: { db: 'asignacion', type: 'string' },
      horas: { db: 'horas', type: 'number' },
      fecha: { db: 'fecha', type: 'string' },
      motivo: { db: 'motivo', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Incidencias': {
    table: 'incidencias',
    columns: {
      id: { db: 'id', type: 'string' },
      tipo_incidencia: { db: 'tipo_incidencia', type: 'string' },
      usuario_afectado: { db: 'usuario_afectado', type: 'string' },
      asignacion: { db: 'asignacion', type: 'string' },
      registro: { db: 'registro', type: 'string' },
      descripcion: { db: 'descripcion', type: 'string' },
      prioridad: { db: 'prioridad', type: 'string' },
      estado_incidencia: { db: 'estado_incidencia', type: 'string' },
      creado_por: { db: 'creado_por', type: 'string' },
      asignado_a: { db: 'asignado_a', type: 'string' },
      fecha_resolucion: { db: 'fecha_resolucion', type: 'date' },
      comentario_resolucion: { db: 'comentario_resolucion', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Horarios_Clase': {
    table: 'horarios_clase',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      dia_semana: { db: 'dia_semana', type: 'string' },
      hora_inicio: { db: 'hora_inicio', type: 'string' },
      hora_fin: { db: 'hora_fin', type: 'string' },
      materia: { db: 'materia', type: 'string' },
      es_clase: { db: 'es_clase', type: 'boolean' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Eventos': {
    table: 'eventos',
    columns: {
      id: { db: 'id', type: 'string' },
      titulo: { db: 'titulo', type: 'string' },
      descripcion: { db: 'descripcion', type: 'string' },
      fecha: { db: 'fecha', type: 'string' },
      hora_inicio: { db: 'hora_inicio', type: 'string' },
      hora_fin: { db: 'hora_fin', type: 'string' },
      ubicacion: { db: 'ubicacion', type: 'string' },
      creado_por: { db: 'creado_por', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Constancias': {
    table: 'constancias',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      tipo_constancia: { db: 'tipo_constancia', type: 'string' },
      estado: { db: 'estado', type: 'string' },
      fecha_emision: { db: 'fecha_emision', type: 'string' },
      fecha_revocacion: { db: 'fecha_revocacion', type: 'date' },
      folio: { db: 'folio', type: 'string' },
      horas_completadas: { db: 'horas_completadas', type: 'number' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Encuestas': {
    table: 'encuestas',
    columns: {
      id: { db: 'id', type: 'string' },
      titulo: { db: 'titulo', type: 'string' },
      descripcion: { db: 'descripcion', type: 'string' },
      preguntas: { db: 'preguntas', type: 'string' },
      activa: { db: 'activa', type: 'boolean' },
      creado_por: { db: 'creado_por', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Respuestas_Encuesta': {
    table: 'respuestas_encuesta',
    columns: {
      id: { db: 'id', type: 'string' },
      encuesta: { db: 'encuesta', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      respuestas: { db: 'respuestas', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Evaluaciones_Alumno': {
    table: 'evaluaciones_alumno',
    columns: {
      id: { db: 'id', type: 'string' },
      alumno: { db: 'alumno', type: 'string' },
      evaluador: { db: 'evaluador', type: 'string' },
      periodo: { db: 'periodo', type: 'string' },
      puntualidad: { db: 'puntualidad', type: 'integer' },
      responsabilidad: { db: 'responsabilidad', type: 'integer' },
      iniciativa: { db: 'iniciativa', type: 'integer' },
      calidad_trabajo: { db: 'calidad_trabajo', type: 'integer' },
      actitud: { db: 'actitud', type: 'integer' },
      cumplimiento: { db: 'cumplimiento', type: 'integer' },
      comentario: { db: 'comentario', type: 'string' },
      fecha: { db: 'fecha', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Materiales_Recibidos': {
    table: 'materiales_recibidos',
    columns: {
      id: { db: 'id', type: 'string' },
      tipo_material: { db: 'tipo_material', type: 'string' },
      cantidad: { db: 'cantidad', type: 'number' },
      unidad: { db: 'unidad', type: 'string' },
      fecha_recepcion: { db: 'fecha_recepcion', type: 'string' },
      proveedor: { db: 'donante', type: 'string' },
      estado: { db: 'estado', type: 'string' },
      observaciones: { db: 'observaciones', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Salidas_Materiales': {
    table: 'salidas_materiales',
    columns: {
      id: { db: 'id', type: 'string' },
      material: { db: 'material', type: 'string' },
      cantidad: { db: 'cantidad', type: 'number' },
      destinatario: { db: 'destinatario', type: 'string' },
      fecha: { db: 'fecha', type: 'string' },
      observaciones: { db: 'observaciones', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Codigos_QR': {
    table: 'codigos_qr',
    columns: {
      id: { db: 'id', type: 'string' },
      codigo: { db: 'codigo', type: 'string' },
      actividad: { db: 'actividad', type: 'string' },
      tipo: { db: 'tipo', type: 'string' },
      activo: { db: 'activo', type: 'boolean' },
      fecha_expiracion: { db: 'fecha_expiracion', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Pases_Lista': {
    table: 'pases_lista',
    columns: {
      id: { db: 'id', type: 'string' },
      area: { db: 'area', type: 'string' },
      creado_por: { db: 'creado_por', type: 'string' },
      creado_por_nombre: { db: 'creado_por_nombre', type: 'string' },
      estado: { db: 'estado', type: 'string' },
      mensaje: { db: 'mensaje', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Respuestas_Pases_Lista': {
    table: 'respuestas_pases_lista',
    columns: {
      id: { db: 'id', type: 'string' },
      pase_lista: { db: 'pase_lista', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      estado_respuesta: { db: 'estado_respuesta', type: 'string' },
      comentario: { db: 'comentario', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Invitaciones': {
    table: 'invitaciones',
    columns: {
      id: { db: 'id', type: 'string' },
      email: { db: 'email', type: 'string' },
      rol: { db: 'rol', type: 'string' },
      area: { db: 'area', type: 'string' },
      estado: { db: 'estado', type: 'string' },
      usuario_id: { db: 'usuario_id', type: 'string' },
      nombre_completo: { db: 'nombre_completo', type: 'string' },
      matricula: { db: 'matricula', type: 'string' },
      carrera: { db: 'carrera', type: 'string' },
      telefono: { db: 'telefono', type: 'string' },
      fecha_envio: { db: 'fecha_envio', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Configuracion_Sistema': {
    table: 'configuracion_sistema',
    columns: {
      id: { db: 'id', type: 'string' },
      hora_apertura: { db: 'hora_apertura', type: 'string' },
      hora_cierre: { db: 'hora_cierre', type: 'string' },
      dias_laborales: { db: 'dias_laborales', type: 'string' },
      periodo_actual: { db: 'periodo_actual', type: 'string' },
      tiempo_minimo_registro: { db: 'tolerancia_minutos', type: 'integer' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
  'Bitacora_Auditoria': {
    table: 'bitacora_auditoria',
    columns: {
      id: { db: 'id', type: 'string' },
      usuario: { db: 'usuario', type: 'string' },
      accion: { db: 'accion', type: 'string' },
      entidad: { db: 'entidad', type: 'string' },
      entidad_id: { db: 'entidad_id', type: 'string' },
      detalles: { db: 'detalles', type: 'string' },
      created_date: { db: 'created_date', type: 'date' },
      updated_date: { db: 'updated_date', type: 'date' },
    }
  },
};

function importEntity(entityName, filePath) {
  const mapping = entityMappings[entityName];
  if (!mapping) {
    console.log(`⚠️ No mapping for ${entityName}, skipping...`);
    return { imported: 0, skipped: 0 };
  }
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️ File not found: ${filePath}`);
    return { imported: 0, skipped: 0 };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    console.log(`⚠️ Empty file: ${filePath}`);
    return { imported: 0, skipped: 0 };
  }
  
  const { rows } = parseCSV(content);
  if (rows.length === 0) {
    console.log(`⚠️ No data rows in: ${filePath}`);
    return { imported: 0, skipped: 0 };
  }
  
  const table = mapping.table;
  const dbColumns = [];
  const csvColumns = [];
  const types = [];
  
  for (const [csvCol, config] of Object.entries(mapping.columns)) {
    dbColumns.push(config.db);
    csvColumns.push(csvCol);
    types.push(config.type);
  }
  
  const placeholders = dbColumns.map(() => '?').join(', ');
  const insertStmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${dbColumns.join(', ')}) VALUES (${placeholders})`);
  
  let imported = 0;
  let skipped = 0;
  
  db.transaction(() => {
    for (const row of rows) {
      try {
        const values = csvColumns.map((csvCol, idx) => {
          const rawValue = row[csvCol];
          return convertValue(rawValue, types[idx]);
        });
        
        insertStmt.run(...values);
        imported++;
      } catch (err) {
        console.log(`  ⚠️ Error importing row in ${entityName}: ${err.message}`);
        console.log(`     Row: ${JSON.stringify(row).substring(0, 200)}`);
        skipped++;
      }
    }
  })();
  
  console.log(`✅ ${entityName}: ${imported} imported, ${skipped} skipped`);
  return { imported, skipped };
}

// Orden de importación respetando dependencias
const importOrder = [
  'Configuracion_Sistema',
  'Actividades',
  'Eventos',
  'Encuestas',
  'Codigos_QR',
  'Asignaciones',
  'Horarios_Clase',
  'Registros_QR',
  'Evidencias',
  'Bonos',
  'Incidencias',
  'Pases_Lista',
  'Respuestas_Pases_Lista',
  'Constancias',
  'Evaluaciones_Alumno',
  'Materiales_Recibidos',
  'Electronicos_Reciclados',
  'Salidas_Materiales',
  'Stock_Minimo',
  'Invitaciones',
  'Bitacora_Auditoria',
];

console.log('📦 Importing data from CSV files...\n');

let totalImported = 0;
let totalSkipped = 0;

for (const entityName of importOrder) {
  const filePath = path.join(dataDir, `${entityName}_export.csv`);
  const result = importEntity(entityName, filePath);
  totalImported += result.imported;
  totalSkipped += result.skipped;
}

console.log(`\n📊 Total: ${totalImported} records imported, ${totalSkipped} skipped`);
console.log('✨ Import completed!');
