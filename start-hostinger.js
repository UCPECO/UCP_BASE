// Entry point para Hostinger Node.js
// Este archivo debe ser configurado como "Application startup file" en el panel de Hostinger

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// En Hostinger, el puerto se asigna por variable de entorno
console.log('🚀 Iniciando UCP Horas en Hostinger...');
console.log('📁 Directorio:', __dirname);
console.log('🔌 Puerto (env.PORT):', process.env.PORT || '3001 (default)');

// Inicializa la base de datos ANTES de arrancar el servidor.
// setup.js es idempotente (CREATE TABLE IF NOT EXISTS), así que es seguro
// ejecutarlo en cada arranque. Sin esto, en un deploy limpio la BD queda
// vacía y todas las rutas fallan con "no such table".
import './server/setup.js';

// Importa el servidor directamente
import './server/index.js';
