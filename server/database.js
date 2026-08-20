import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ===== Ubicación de la base de datos =====
// Hostinger reemplaza la carpeta de la app en cada deploy, así que la BD
// NO puede vivir dentro del proyecto: se perdería. Prioridad:
//   1. UCP_DB_PATH (variable de entorno, recomendada en producción)
//   2. server/data.sqlite si ya existe (desarrollo local)
//   3. ~/ucp_data/data.sqlite (fuera de la carpeta de la app: sobrevive deploys)
function resolverRutaBD() {
  if (process.env.UCP_DB_PATH) return process.env.UCP_DB_PATH;
  const local = join(__dirname, 'data.sqlite');
  if (fs.existsSync(local)) return local;
  return join(os.homedir(), 'ucp_data', 'data.sqlite');
}

const dbPath = resolverRutaBD();
fs.mkdirSync(dirname(dbPath), { recursive: true });

// Migración única: si se configuró UCP_DB_PATH y el destino no existe aún,
// copiar la BD local (con sus archivos WAL) para no perder los datos.
const localPath = join(__dirname, 'data.sqlite');
if (dbPath !== localPath && !fs.existsSync(dbPath) && fs.existsSync(localPath)) {
  for (const sufijo of ['', '-wal', '-shm']) {
    if (fs.existsSync(localPath + sufijo)) fs.copyFileSync(localPath + sufijo, dbPath + sufijo);
  }
  console.log(`📦 Base de datos migrada a ${dbPath}`);
}

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
console.log(`📁 Base de datos: ${dbPath}`);

// Respaldo con rotación diaria: copia consistente junto a la BD
// (data-respaldo.sqlite, siempre el más reciente) + carpeta respaldos/
// con una copia por día; se conservan los últimos 7 días.
export function respaldarBD() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const dir = dirname(dbPath);
    fs.copyFileSync(dbPath, join(dir, 'data-respaldo.sqlite'));

    const dirRespaldos = join(dir, 'respaldos');
    fs.mkdirSync(dirRespaldos, { recursive: true });
    const hoy = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    fs.copyFileSync(dbPath, join(dirRespaldos, `data-${hoy}.sqlite`));

    // Conservar solo los 7 respaldos diarios más recientes
    const archivos = fs.readdirSync(dirRespaldos)
      .filter((f) => /^data-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
      .sort();
    archivos.slice(0, Math.max(0, archivos.length - 7))
      .forEach((f) => { try { fs.unlinkSync(join(dirRespaldos, f)); } catch { /* ignorar */ } });

    console.log('💾 Respaldo de la base de datos actualizado');
  } catch (e) {
    console.error('Error al respaldar la BD:', e.message);
  }
}
