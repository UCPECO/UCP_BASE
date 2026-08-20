import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { generateToken, authMiddleware, JWT_SECRET } from '../middleware/auth.js';

const router = Router();

// Obtener usuario actual
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  delete user.password;
  res.json(user);
});

// Login con email y password
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password requeridos' });
  }
  
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !user.password) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  
  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  
  const token = generateToken(user);
  delete user.password;
  res.json({ user, token });
});

// Registro público DESHABILITADO: el administrador crea todas las cuentas
// desde la pestaña de Personal (ver /admin-create-user).
router.post('/register', (req, res) => {
  return res.status(403).json({
    error: 'El registro público está deshabilitado. El administrador debe crear tu cuenta desde la pestaña de Personal.'
  });
});

// Admin: crear usuario con credenciales listas para iniciar sesión
router.post('/admin-create-user', authMiddleware, (req, res) => {
  // Verificar que quien hace la peticion es admin
  const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden crear usuarios' });
  }

  const {
    email, password, full_name, role,
    area_asignada, area_encargada,
    telefono, carrera, matricula, facultad,
  } = req.body;

  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
  }

  const ROLES_VALIDOS = ['admin', 'encargado', 'servicio_social', 'voluntario', 'practicas_profesionales'];
  const rolFinal = ROLES_VALIDOS.includes(role) ? role : 'voluntario';

  const emailLimpio = String(email).toLowerCase().trim();
  const existing = db.prepare('SELECT 1 FROM users WHERE email = ?').get(emailLimpio);
  if (existing) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  const id = uuidv4();
  const hashedPassword = bcrypt.hashSync(String(password), 10);

  db.prepare(`
    INSERT INTO users (id, email, password, full_name, role, area_asignada, area_encargada, telefono, carrera, matricula)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    emailLimpio,
    hashedPassword,
    String(full_name).trim(),
    rolFinal,
    rolFinal === 'encargado' ? '' : (area_asignada || ''),
    rolFinal === 'encargado' ? (area_encargada || '') : '',
    telefono || '',
    carrera || '',
    matricula || ''
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  delete user.password;
  // No devolvemos token: el admin sigue con su propia sesión
  res.status(201).json({ user });
});

// Verificar OTP (simulado - en self-host no hay email real)
router.post('/verify-otp', (req, res) => {
  const { email, otpCode } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  const token = generateToken(user);
  delete user.password;
  res.json({ user, token });
});

// Reenviar OTP (simulado)
router.post('/resend-otp', (req, res) => {
  res.json({ ok: true, message: 'OTP reenviado (simulado)' });
});

// Solicitar reset de password
router.post('/reset-password-request', (req, res) => {
  const { email } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.toLowerCase()?.trim());
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  const resetToken = generateToken({ id: user.id, email: user.email, role: user.role });
  res.json({ ok: true, resetToken });
});

// Resetear password
router.post('/reset-password', (req, res) => {
  const { resetToken, newPassword } = req.body;
  if (!resetToken || !newPassword) {
    return res.status(400).json({ error: 'Token y nueva password requeridos' });
  }
  
  try {
    const decoded = jwt.verify(resetToken, JWT_SECRET);
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, decoded.id);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Token invalido' });
  }
});

// Actualizar perfil
router.put('/me', authMiddleware, (req, res) => {
  const updates = req.body;
  const allowedFields = ['full_name', 'nombre_completo', 'telefono', 'carrera', 'matricula', 'foto_perfil', 'area_asignada'];
  const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
  
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No hay campos validos para actualizar' });
  }
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  values.push(req.user.id);
  
  db.prepare(`UPDATE users SET ${setClause}, updated_date = datetime('now') WHERE id = ?`).run(...values);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  delete user.password;
  res.json(user);
});

// Logout (no-op en JWT, el cliente borra el token)
router.post('/logout', (req, res) => {
  res.json({ ok: true });
});

// Admin: cambiar password de cualquier usuario
router.post('/admin-reset-password', authMiddleware, (req, res) => {
  const { userId, newPassword } = req.body;
  
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'userId y newPassword requeridos' });
  }
  
  // Verificar que quien hace la peticion es admin
  const admin = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores pueden cambiar passwords' });
  }
  
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, userId);
  
  res.json({ ok: true, message: 'Password actualizada correctamente' });
});

export default router;
