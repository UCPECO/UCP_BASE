import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
// Asegura el esquema (tablas y columnas nuevas) en cada arranque; es idempotente
import './setup.js';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';
import functionRoutes from './routes/functions.js';
import { cerrarFichajesOlvidados } from './lib/gestion.js';
import { respaldarBD, db } from './database.js';
import { securityHeaders, rateLimit } from './middleware/security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.disable('x-powered-by'); // no anunciar la tecnología del servidor
app.use(securityHeaders);
// El frontend se sirve desde el mismo dominio: no se necesita CORS
// para orígenes externos; esto bloquea llamadas a la API desde otros sitios.
app.use(cors({ origin: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Límite general de la API por IP (generoso: la app hace polling y cargas en paralelo)
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 400, mensaje: 'Demasiadas solicitudes. Espera un momento.' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/functions', functionRoutes);

// Upload endpoint (simulado - guarda en servidor)
app.post('/api/upload', (req, res) => {
  // En self-hosted básico, los uploads se simulan
  res.json({ file_url: `/uploads/${Date.now()}.bin` });
});

// Health check (incluye versión de código y estado del esquema para diagnóstico)
app.get('/api/health', (req, res) => {
  let tablas = {};
  try {
    const nombres = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    tablas = {
      checklist_bodega: nombres.includes('checklist_bodega'),
      reportes_huella: nombres.includes('reportes_huella'),
    };
  } catch (e) { /* diagnóstico no debe romper el health check */ }
  res.json({ status: 'ok', mode: 'self-hosted', version: '2026-08-20-bodega-pro', tablas });
});

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In production, serve the built frontend
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 UCP Horas Server running on http://localhost:${PORT}`);
  // Cerrar fichajes olvidados al arrancar y luego cada 6 horas, con respaldo de la BD
  const mantenimiento = () => { cerrarFichajesOlvidados(); respaldarBD(); };
  mantenimiento();
  setInterval(mantenimiento, 6 * 60 * 60 * 1000);
});
