import { db } from './database.js';
import bcrypt from 'bcryptjs';

// Tabla de usuarios (con campos extendidos de base44)
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    full_name TEXT,
    nombre_completo TEXT,
    role TEXT DEFAULT 'user',
    area_asignada TEXT,
    area_encargada TEXT,
    foto_perfil TEXT,
    telefono TEXT,
    carrera TEXT,
    matricula TEXT,
    archivado INTEGER DEFAULT 0,
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de actividades
db.exec(`
  CREATE TABLE IF NOT EXISTS actividades (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT,
    activo INTEGER DEFAULT 1,
    horas_asignadas REAL DEFAULT 0,
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de asignaciones
db.exec(`
  CREATE TABLE IF NOT EXISTS asignaciones (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    actividad TEXT NOT NULL,
    estado TEXT DEFAULT 'activo',
    horas_asignadas REAL DEFAULT 0,
    horas_completadas REAL DEFAULT 0,
    fecha_inicio TEXT,
    fecha_fin TEXT,
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de registros QR (fichajes)
db.exec(`
  CREATE TABLE IF NOT EXISTS registros_qr (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    asignacion TEXT,
    fecha TEXT NOT NULL,
    hora_entrada TEXT,
    hora_salida TEXT,
    estado_registro TEXT DEFAULT 'abierto',
    horas REAL DEFAULT 0,
    fecha_modificacion TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de evidencias
db.exec(`
  CREATE TABLE IF NOT EXISTS evidencias (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    actividad TEXT,
    asignacion TEXT,
    titulo TEXT,
    descripcion TEXT,
    archivo_url TEXT,
    estado_evidencia TEXT DEFAULT 'pendiente',
    aprobado_por TEXT,
    comentario_revision TEXT,
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de bonos
db.exec(`
  CREATE TABLE IF NOT EXISTS bonos (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    asignacion TEXT,
    horas REAL DEFAULT 0,
    fecha TEXT,
    motivo TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de incidencias
db.exec(`
  CREATE TABLE IF NOT EXISTS incidencias (
    id TEXT PRIMARY KEY,
    tipo_incidencia TEXT,
    usuario_afectado TEXT,
    asignacion TEXT,
    registro TEXT,
    descripcion TEXT,
    prioridad TEXT DEFAULT 'media',
    estado_incidencia TEXT DEFAULT 'reportada',
    creado_por TEXT,
    asignado_a TEXT,
    fecha_resolucion TEXT,
    comentario_resolucion TEXT,
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de horarios de clase
db.exec(`
  CREATE TABLE IF NOT EXISTS horarios_clase (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    dia_semana TEXT,
    hora_inicio TEXT,
    hora_fin TEXT,
    materia TEXT,
    salon TEXT,
    es_clase INTEGER DEFAULT 1,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de eventos
db.exec(`
  CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    fecha TEXT,
    hora_inicio TEXT,
    hora_fin TEXT,
    ubicacion TEXT,
    tipo_evento TEXT,
    creado_por TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de constancias
db.exec(`
  CREATE TABLE IF NOT EXISTS constancias (
    id TEXT PRIMARY KEY,
    usuario TEXT NOT NULL,
    tipo_constancia TEXT,
    estado TEXT DEFAULT 'activa',
    fecha_emision TEXT,
    fecha_revocacion TEXT,
    motivo_revocacion TEXT,
    archivo_url TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de encuestas
db.exec(`
  CREATE TABLE IF NOT EXISTS encuestas (
    id TEXT PRIMARY KEY,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    preguntas TEXT,
    activa INTEGER DEFAULT 1,
    creado_por TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de respuestas de encuesta
db.exec(`
  CREATE TABLE IF NOT EXISTS respuestas_encuesta (
    id TEXT PRIMARY KEY,
    encuesta TEXT NOT NULL,
    usuario TEXT NOT NULL,
    respuestas TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de evaluaciones de alumno
db.exec(`
  CREATE TABLE IF NOT EXISTS evaluaciones_alumno (
    id TEXT PRIMARY KEY,
    alumno TEXT NOT NULL,
    evaluador TEXT,
    periodo TEXT,
    puntualidad INTEGER,
    responsabilidad INTEGER,
    iniciativa INTEGER,
    trabajo_equipo INTEGER,
    cumplimiento INTEGER,
    observaciones TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de materiales recibidos
db.exec(`
  CREATE TABLE IF NOT EXISTS materiales_recibidos (
    id TEXT PRIMARY KEY,
    tipo_material TEXT,
    cantidad REAL DEFAULT 0,
    unidad TEXT,
    fecha_recepcion TEXT,
    donante TEXT,
    estado TEXT DEFAULT 'disponible',
    observaciones TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de electrónicos reciclados
db.exec(`
  CREATE TABLE IF NOT EXISTS electronicos_reciclados (
    id TEXT PRIMARY KEY,
    tipo_dispositivo TEXT,
    marca TEXT,
    modelo TEXT,
    numero_serie TEXT,
    estado TEXT DEFAULT 'funcional',
    fecha_recepcion TEXT,
    donante TEXT,
    observaciones TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de salidas de materiales
db.exec(`
  CREATE TABLE IF NOT EXISTS salidas_materiales (
    id TEXT PRIMARY KEY,
    material TEXT,
    cantidad REAL DEFAULT 0,
    destinatario TEXT,
    fecha TEXT,
    observaciones TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de stock mínimo
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_minimo (
    id TEXT PRIMARY KEY,
    tipo_material TEXT,
    cantidad_minima REAL DEFAULT 0,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de códigos QR
db.exec(`
  CREATE TABLE IF NOT EXISTS codigos_qr (
    id TEXT PRIMARY KEY,
    codigo TEXT UNIQUE,
    actividad TEXT,
    tipo TEXT,
    activo INTEGER DEFAULT 1,
    fecha_expiracion TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de pases de lista
db.exec(`
  CREATE TABLE IF NOT EXISTS pases_lista (
    id TEXT PRIMARY KEY,
    area TEXT,
    creado_por TEXT,
    creado_por_nombre TEXT,
    estado TEXT DEFAULT 'activo',
    mensaje TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de respuestas a pases de lista
db.exec(`
  CREATE TABLE IF NOT EXISTS respuestas_pases_lista (
    id TEXT PRIMARY KEY,
    pase_lista TEXT NOT NULL,
    usuario TEXT NOT NULL,
    estado_respuesta TEXT DEFAULT 'presente',
    comentario TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de invitaciones
db.exec(`
  CREATE TABLE IF NOT EXISTS invitaciones (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    rol TEXT DEFAULT 'user',
    area TEXT,
    estado TEXT DEFAULT 'pendiente',
    usuario_id TEXT,
    fecha_envio TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de configuración del sistema
db.exec(`
  CREATE TABLE IF NOT EXISTS configuracion_sistema (
    id TEXT PRIMARY KEY,
    hora_apertura TEXT DEFAULT '08:00',
    hora_cierre TEXT DEFAULT '18:00',
    dias_laborales TEXT DEFAULT 'Lunes,Martes,Miércoles,Jueves,Viernes',
    tolerancia_minutos INTEGER DEFAULT 15,
    hora_limite_salida TEXT DEFAULT '17:15',
    created_date TEXT DEFAULT (datetime('now')),
    updated_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de bitácora de auditoría
db.exec(`
  CREATE TABLE IF NOT EXISTS bitacora_auditoria (
    id TEXT PRIMARY KEY,
    usuario TEXT,
    accion TEXT,
    entidad TEXT,
    entidad_id TEXT,
    detalles TEXT,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// Tabla de comentarios en evidencias (hilo de conversación alumno ↔ revisor)
db.exec(`
  CREATE TABLE IF NOT EXISTS comentarios_evidencia (
    id TEXT PRIMARY KEY,
    evidencia TEXT NOT NULL,
    usuario TEXT NOT NULL,
    usuario_nombre TEXT,
    comentario TEXT NOT NULL,
    created_date TEXT DEFAULT (datetime('now'))
  );
`);

// ===== Migraciones idempotentes =====
// Las bases ya desplegadas no reciben columnas nuevas con CREATE TABLE IF NOT EXISTS,
// así que cada columna que el frontend usa se agrega aquí si falta.
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    console.log(`Migración: ${table}.${column} agregada`);
  }
}

// Evidencias: campos que el frontend siempre usó pero la tabla no tenía
addColumnIfMissing('evidencias', 'tipo_evidencia', "tipo_evidencia TEXT DEFAULT 'foto'");
addColumnIfMissing('evidencias', 'fecha_captura', 'fecha_captura TEXT');
addColumnIfMissing('evidencias', 'ubicacion_gps', 'ubicacion_gps TEXT');
addColumnIfMissing('evidencias', 'bono_horas', 'bono_horas REAL DEFAULT 0');
addColumnIfMissing('evidencias', 'bono_motivo', 'bono_motivo TEXT');

// Bodega (materiales recibidos)
addColumnIfMissing('materiales_recibidos', 'proveedor', 'proveedor TEXT');
addColumnIfMissing('materiales_recibidos', 'tipo_proveedor', 'tipo_proveedor TEXT');
addColumnIfMissing('materiales_recibidos', 'tipo_registro', "tipo_registro TEXT DEFAULT 'articulo'");
addColumnIfMissing('materiales_recibidos', 'categoria', 'categoria TEXT');
addColumnIfMissing('materiales_recibidos', 'subcategoria', 'subcategoria TEXT');
addColumnIfMissing('materiales_recibidos', 'material', 'material TEXT');
addColumnIfMissing('materiales_recibidos', 'medida', 'medida TEXT');
addColumnIfMissing('materiales_recibidos', 'descripcion', 'descripcion TEXT');
addColumnIfMissing('materiales_recibidos', 'creado_por', 'creado_por TEXT');

// Electrónicos reciclados
addColumnIfMissing('electronicos_reciclados', 'proveedor', 'proveedor TEXT');
addColumnIfMissing('electronicos_reciclados', 'tipo_proveedor', 'tipo_proveedor TEXT');
addColumnIfMissing('electronicos_reciclados', 'tipo_registro', "tipo_registro TEXT DEFAULT 'articulo'");
addColumnIfMissing('electronicos_reciclados', 'categoria', 'categoria TEXT');
addColumnIfMissing('electronicos_reciclados', 'subcategoria', 'subcategoria TEXT');
addColumnIfMissing('electronicos_reciclados', 'material', 'material TEXT');
addColumnIfMissing('electronicos_reciclados', 'medida', 'medida TEXT');
addColumnIfMissing('electronicos_reciclados', 'reparado_por', 'reparado_por TEXT');
addColumnIfMissing('electronicos_reciclados', 'reparado_por_nombre', 'reparado_por_nombre TEXT');

// Salidas de materiales
addColumnIfMissing('salidas_materiales', 'categoria', 'categoria TEXT');
addColumnIfMissing('salidas_materiales', 'medida', 'medida TEXT');
addColumnIfMissing('salidas_materiales', 'area', 'area TEXT');
addColumnIfMissing('salidas_materiales', 'motivo', 'motivo TEXT');
addColumnIfMissing('salidas_materiales', 'retirado_por', 'retirado_por TEXT');
addColumnIfMissing('salidas_materiales', 'registrado_por', 'registrado_por TEXT');
addColumnIfMissing('salidas_materiales', 'registrado_por_nombre', 'registrado_por_nombre TEXT');

// Stock mínimo
addColumnIfMissing('stock_minimo', 'categoria', 'categoria TEXT');
addColumnIfMissing('stock_minimo', 'medida', 'medida TEXT');
addColumnIfMissing('stock_minimo', 'configurado_por', 'configurado_por TEXT');

// Insertar usuario admin por defecto
const adminExists = db.prepare('SELECT 1 FROM users WHERE email = ?').get('admin@ucp.local');
if (!adminExists) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (id, email, password, full_name, role, area_encargada)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    'admin-default',
    'admin@ucp.local',
    hashedPassword,
    'Administrador',
    'admin',
    'General'
  );
  console.log('Usuario admin creado: admin@ucp.local / admin123');
}

// Insertar configuración por defecto
const configExists = db.prepare('SELECT 1 FROM configuracion_sistema LIMIT 1').get();
if (!configExists) {
  db.prepare(`
    INSERT INTO configuracion_sistema (id, hora_apertura, hora_cierre, dias_laborales)
    VALUES (?, ?, ?, ?)
  `).run('config-default', '08:00', '18:00', 'Lunes,Martes,Miércoles,Jueves,Viernes');
}

console.log('Base de datos inicializada correctamente.');
