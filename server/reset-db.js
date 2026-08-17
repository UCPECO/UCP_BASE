import { db } from './database.js';

// Script para vaciar todas las tablas de datos (dejar estructura intacta)
const tables = [
  'users', 'actividades', 'asignaciones', 'registros_qr', 'evidencias',
  'bonos', 'incidencias', 'horarios_clase', 'eventos', 'constancias',
  'encuestas', 'respuestas_encuesta', 'evaluaciones_alumno',
  'materiales_recibidos', 'electronicos_reciclados', 'salidas_materiales',
  'stock_minimo', 'codigos_qr', 'pases_lista', 'respuestas_pases_lista',
  'invitaciones', 'configuracion_sistema', 'bitacora_auditoria'
];

for (const table of tables) {
  db.prepare(`DELETE FROM ${table}`).run();
  console.log(`  Tabla ${table} vaciada`);
}

console.log('\n✅ Base de datos vaciada. Todas las tablas estan en blanco.');
console.log('   Ahora puedes agregar usuarios y datos manualmente.');
