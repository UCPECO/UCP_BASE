import { db } from './database.js';
import bcrypt from 'bcryptjs';

// Script para crear el usuario administrador despues de importar datos
const hashedPassword = bcrypt.hashSync('admin123', 10);

db.prepare(`
  INSERT OR REPLACE INTO users (id, email, password, full_name, role, area_encargada)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('admin-default', 'admin@ucp.local', hashedPassword, 'Administrador', 'admin', 'General');

console.log('✅ Usuario admin creado/actualizado:');
console.log('   Email:    admin@ucp.local');
console.log('   Password: admin123');
