// Entry point alternativo para plataformas que esperan "server.js" en la raíz.
// Hace exactamente lo mismo que start-hostinger.js:
// 1) Inicializa la base de datos (idempotente, no borra datos existentes)
// 2) Arranca el servidor Express

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🚀 Iniciando UCP Horas...');
console.log('📁 Directorio:', __dirname);
console.log('🔌 Puerto (env.PORT):', process.env.PORT || '3001 (default)');

import './server/setup.js';
import './server/index.js';
