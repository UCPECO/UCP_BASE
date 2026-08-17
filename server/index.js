import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import entityRoutes from './routes/entities.js';
import functionRoutes from './routes/functions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/entities', entityRoutes);
app.use('/api/functions', functionRoutes);

// Upload endpoint (simulado - guarda en servidor)
app.post('/api/upload', (req, res) => {
  // En self-hosted básico, los uploads se simulan
  res.json({ file_url: `/uploads/${Date.now()}.bin` });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'self-hosted' });
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
  console.log(`📁 Database: ${path.join(__dirname, 'data.sqlite')}`);
});
