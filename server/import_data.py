#!/usr/bin/env python3
"""
Script de importación de datos CSV a SQLite para UCP Horas.
Ejecutar: python3 import_data.py
Requiere: Python 3.7+ (sqlite3 incluido)
"""

import sqlite3
import csv
import os
import json
from pathlib import Path
from datetime import datetime

DATA_DIR = Path(__file__).parent / "data"
DB_PATH = Path(__file__).parent / "data.sqlite"

def init_db():
    """Crea todas las tablas necesarias."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Eliminar tablas existentes para importación limpia
    tables = [
        'users', 'actividades', 'asignaciones', 'registros_qr', 'evidencias',
        'bonos', 'incidencias', 'horarios_clase', 'eventos', 'constancias',
        'encuestas', 'respuestas_encuesta', 'evaluaciones_alumno',
        'materiales_recibidos', 'electronicos_reciclados', 'salidas_materiales',
        'stock_minimo', 'codigos_qr', 'pases_lista', 'respuestas_pases_lista',
        'invitaciones', 'configuracion_sistema', 'bitacora_auditoria'
    ]
    for t in tables:
        c.execute(f'DROP TABLE IF EXISTS {t}')
    
    # Tabla de usuarios
    c.execute('''
        CREATE TABLE users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE,
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
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE actividades (
            id TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            descripcion TEXT,
            categoria TEXT,
            activo INTEGER DEFAULT 1,
            horas_asignadas REAL DEFAULT 0,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE asignaciones (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            actividad TEXT NOT NULL,
            estado TEXT DEFAULT 'activo',
            horas_asignadas REAL DEFAULT 0,
            horas_completadas REAL DEFAULT 0,
            fecha_inicio TEXT,
            fecha_fin TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE registros_qr (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            asignacion TEXT,
            fecha TEXT NOT NULL,
            hora_entrada TEXT,
            hora_salida TEXT,
            estado_registro TEXT DEFAULT 'abierto',
            horas REAL DEFAULT 0,
            comentario_admin TEXT,
            fecha_modificacion TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE evidencias (
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
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE bonos (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            asignacion TEXT,
            horas REAL DEFAULT 0,
            fecha TEXT,
            motivo TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE incidencias (
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
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE horarios_clase (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            dia_semana TEXT,
            hora_inicio TEXT,
            hora_fin TEXT,
            materia TEXT,
            salon TEXT,
            es_clase INTEGER DEFAULT 1,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE eventos (
            id TEXT PRIMARY KEY,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            fecha TEXT,
            hora_inicio TEXT,
            hora_fin TEXT,
            ubicacion TEXT,
            tipo_evento TEXT,
            creado_por TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE constancias (
            id TEXT PRIMARY KEY,
            usuario TEXT NOT NULL,
            tipo_constancia TEXT,
            estado TEXT DEFAULT 'activa',
            fecha_emision TEXT,
            fecha_revocacion TEXT,
            folio TEXT,
            horas_completadas REAL,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE encuestas (
            id TEXT PRIMARY KEY,
            titulo TEXT NOT NULL,
            descripcion TEXT,
            preguntas TEXT,
            activa INTEGER DEFAULT 1,
            creado_por TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE respuestas_encuesta (
            id TEXT PRIMARY KEY,
            encuesta TEXT NOT NULL,
            usuario TEXT NOT NULL,
            respuestas TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE evaluaciones_alumno (
            id TEXT PRIMARY KEY,
            alumno TEXT NOT NULL,
            evaluador TEXT,
            periodo TEXT,
            puntualidad INTEGER,
            responsabilidad INTEGER,
            iniciativa INTEGER,
            calidad_trabajo INTEGER,
            actitud INTEGER,
            cumplimiento INTEGER,
            comentario TEXT,
            fecha TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE materiales_recibidos (
            id TEXT PRIMARY KEY,
            tipo_material TEXT,
            cantidad REAL DEFAULT 0,
            unidad TEXT,
            fecha_recepcion TEXT,
            donante TEXT,
            estado TEXT DEFAULT 'disponible',
            observaciones TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE electronicos_reciclados (
            id TEXT PRIMARY KEY,
            tipo_dispositivo TEXT,
            marca TEXT,
            modelo TEXT,
            numero_serie TEXT,
            estado TEXT DEFAULT 'funcional',
            fecha_recepcion TEXT,
            donante TEXT,
            observaciones TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE salidas_materiales (
            id TEXT PRIMARY KEY,
            material TEXT,
            cantidad REAL DEFAULT 0,
            destinatario TEXT,
            fecha TEXT,
            observaciones TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE stock_minimo (
            id TEXT PRIMARY KEY,
            tipo_material TEXT,
            cantidad_minima REAL DEFAULT 0,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE codigos_qr (
            id TEXT PRIMARY KEY,
            codigo TEXT,
            actividad TEXT,
            tipo TEXT,
            activo INTEGER DEFAULT 1,
            fecha_expiracion TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE pases_lista (
            id TEXT PRIMARY KEY,
            area TEXT,
            creado_por TEXT,
            creado_por_nombre TEXT,
            estado TEXT DEFAULT 'activo',
            mensaje TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE respuestas_pases_lista (
            id TEXT PRIMARY KEY,
            pase_lista TEXT NOT NULL,
            usuario TEXT NOT NULL,
            estado_respuesta TEXT DEFAULT 'presente',
            comentario TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE invitaciones (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            rol TEXT DEFAULT 'user',
            area TEXT,
            estado TEXT DEFAULT 'pendiente',
            usuario_id TEXT,
            nombre_completo TEXT,
            matricula TEXT,
            carrera TEXT,
            telefono TEXT,
            fecha_envio TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE configuracion_sistema (
            id TEXT PRIMARY KEY,
            hora_apertura TEXT DEFAULT '08:00',
            hora_cierre TEXT DEFAULT '18:00',
            dias_laborales TEXT DEFAULT 'Lunes,Martes,Miércoles,Jueves,Viernes',
            tolerancia_minutos INTEGER DEFAULT 15,
            hora_limite_salida TEXT DEFAULT '17:15',
            periodo_actual TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    c.execute('''
        CREATE TABLE bitacora_auditoria (
            id TEXT PRIMARY KEY,
            usuario TEXT,
            accion TEXT,
            entidad TEXT,
            entidad_id TEXT,
            detalles TEXT,
            created_date TEXT,
            updated_date TEXT
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Base de datos inicializada")

def parse_csv_file(filepath):
    """Lee un archivo CSV y retorna lista de diccionarios."""
    if not filepath.exists() or filepath.stat().st_size == 0:
        return []
    
    rows = []
    with open(filepath, 'r', encoding='utf-8') as f:
        # Leer todo el contenido para manejar saltos de línea dentro de campos
        content = f.read()
        
    # Usar el csv.reader de Python que maneja comillas correctamente
    import io
    reader = csv.reader(io.StringIO(content))
    headers = next(reader)
    headers = [h.strip().strip('"') for h in headers]
    
    for row in reader:
        if not row or all(cell.strip() == '' for cell in row):
            continue
        # Asegurar que cada fila tenga el mismo número de columnas que los headers
        while len(row) < len(headers):
            row.append('')
        row = row[:len(headers)]
        
        obj = {}
        for i, h in enumerate(headers):
            obj[h] = row[i].strip().strip('"') if row[i] else ''
        rows.append(obj)
    
    return rows

def convert_bool(val):
    if val is None or val == '':
        return None
    return 1 if val.lower() in ('true', '1', 'yes', 'si') else 0

def convert_number(val):
    if val is None or val == '':
        return None
    try:
        return float(val)
    except:
        return None

def convert_int(val):
    if val is None or val == '':
        return None
    try:
        return int(float(val))
    except:
        return None

def import_table(conn, table_name, csv_name, column_map):
    """Importa datos de un CSV a una tabla."""
    filepath = DATA_DIR / f"{csv_name}_export.csv"
    rows = parse_csv_file(filepath)
    if not rows:
        print(f"⚪ {table_name}: sin datos")
        return 0
    
    cursor = conn.cursor()
    imported = 0
    
    for row in rows:
        try:
            cols = []
            vals = []
            for csv_col, (db_col, converter) in column_map.items():
                if csv_col in row:
                    raw = row[csv_col]
                    val = converter(raw)
                    if val is not None:
                        cols.append(db_col)
                        vals.append(val)
            
            if not cols:
                continue
                
            placeholders = ','.join(['?' for _ in cols])
            sql = f"INSERT OR REPLACE INTO {table_name} ({','.join(cols)}) VALUES ({placeholders})"
            cursor.execute(sql, vals)
            imported += 1
        except Exception as e:
            print(f"  ⚠️ Error en {table_name}: {e}")
    
    conn.commit()
    print(f"✅ {table_name}: {imported} registros importados")
    return imported

def import_all():
    conn = sqlite3.connect(DB_PATH)
    total = 0
    
    # 1. Actividades
    total += import_table(conn, 'actividades', 'Actividades', {
        'id': ('id', str),
        'nombre': ('nombre', str),
        'descripcion': ('descripcion', lambda x: x if x else None),
        'categoria': ('categoria', lambda x: x if x else None),
        'activo': ('activo', convert_bool),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 2. Configuracion_Sistema
    total += import_table(conn, 'configuracion_sistema', 'Configuracion_Sistema', {
        'id': ('id', str),
        'hora_apertura': ('hora_apertura', str),
        'hora_cierre': ('hora_cierre', str),
        'dias_laborales': ('dias_laborales', str),
        'periodo_actual': ('periodo_actual', lambda x: x if x else None),
        'tiempo_minimo_registro': ('tolerancia_minutos', convert_int),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 3. Eventos (archivo vacío, pero definimos el mapeo)
    total += import_table(conn, 'eventos', 'Eventos', {
        'id': ('id', str),
        'titulo': ('titulo', str),
        'descripcion': ('descripcion', lambda x: x if x else None),
        'fecha': ('fecha', str),
        'hora_inicio': ('hora_inicio', str),
        'hora_fin': ('hora_fin', str),
        'ubicacion': ('ubicacion', str),
        'creado_por': ('creado_por', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 4. Encuestas
    total += import_table(conn, 'encuestas', 'Encuestas', {
        'id': ('id', str),
        'titulo': ('titulo', str),
        'descripcion': ('descripcion', lambda x: x if x else None),
        'preguntas': ('preguntas', str),
        'activa': ('activa', convert_bool),
        'creado_por': ('creado_por', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 5. Codigos_QR
    total += import_table(conn, 'codigos_qr', 'Codigos_QR', {
        'id': ('id', str),
        'codigo': ('codigo', lambda x: x if x else None),
        'actividad': ('actividad', lambda x: x if x else None),
        'tipo': ('tipo', str),
        'activo': ('activo', convert_bool),
        'fecha_expiracion': ('fecha_expiracion', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 6. Asignaciones
    total += import_table(conn, 'asignaciones', 'Asignaciones', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'actividad': ('actividad', str),
        'estado': ('estado', str),
        'fecha_inicio': ('fecha_inicio', str),
        'fecha_fin_estimada': ('fecha_fin', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 7. Horarios_Clase
    total += import_table(conn, 'horarios_clase', 'Horarios_Clase', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'dia_semana': ('dia_semana', str),
        'hora_inicio': ('hora_inicio', str),
        'hora_fin': ('hora_fin', str),
        'materia': ('materia', lambda x: x if x else None),
        'es_clase': ('es_clase', convert_bool),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 8. Registros_QR
    total += import_table(conn, 'registros_qr', 'Registros_QR', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'asignacion': ('asignacion', str),
        'fecha': ('fecha', str),
        'hora_entrada': ('hora_entrada', str),
        'hora_salida': ('hora_salida', str),
        'estado_registro': ('estado_registro', str),
        'fecha_modificacion': ('fecha_modificacion', str),
        'comentario_admin': ('comentario_admin', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 9. Evidencias
    total += import_table(conn, 'evidencias', 'Evidencias', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'actividad': ('actividad', str),
        'asignacion': ('asignacion', str),
        'titulo': ('titulo', lambda x: x if x else None),
        'descripcion': ('descripcion', lambda x: x if x else None),
        'archivo': ('archivo_url', str),
        'estado_evidencia': ('estado_evidencia', str),
        'aprobado_por': ('aprobado_por', str),
        'comentario_revision': ('comentario_revision', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 10. Bonos
    total += import_table(conn, 'bonos', 'Bonos', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'asignacion': ('asignacion', lambda x: x if x else None),
        'horas': ('horas', convert_number),
        'fecha': ('fecha', str),
        'motivo': ('motivo', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 11. Incidencias
    total += import_table(conn, 'incidencias', 'Incidencias', {
        'id': ('id', str),
        'tipo_incidencia': ('tipo_incidencia', str),
        'usuario_afectado': ('usuario_afectado', str),
        'asignacion': ('asignacion', str),
        'registro': ('registro', lambda x: x if x else None),
        'descripcion': ('descripcion', str),
        'prioridad': ('prioridad', str),
        'estado_incidencia': ('estado_incidencia', str),
        'creado_por': ('creado_por', str),
        'asignado_a': ('asignado_a', lambda x: x if x else None),
        'fecha_resolucion': ('fecha_resolucion', str),
        'comentario_resolucion': ('comentario_resolucion', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 12. Pases_Lista
    total += import_table(conn, 'pases_lista', 'Pases_Lista', {
        'id': ('id', str),
        'area': ('area', str),
        'creado_por': ('creado_por', str),
        'creado_por_nombre': ('creado_por_nombre', str),
        'estado': ('estado', str),
        'mensaje': ('mensaje', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 13. Respuestas_Pases_Lista
    total += import_table(conn, 'respuestas_pases_lista', 'Respuestas_Pases_Lista', {
        'id': ('id', str),
        'pase_lista': ('pase_lista', str),
        'usuario': ('usuario', str),
        'estado_respuesta': ('estado_respuesta', str),
        'comentario': ('comentario', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 14. Constancias
    total += import_table(conn, 'constancias', 'Constancias', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'tipo_constancia': ('tipo_constancia', str),
        'estado': ('estado', str),
        'fecha_inicio': ('fecha_emision', str),
        'fecha_revocacion': ('fecha_revocacion', str),
        'folio': ('folio', str),
        'horas_completadas': ('horas_completadas', convert_number),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 15. Evaluaciones_Alumno
    total += import_table(conn, 'evaluaciones_alumno', 'Evaluaciones_Alumno', {
        'id': ('id', str),
        'usuario': ('alumno', str),
        'evaluado_por': ('evaluador', str),
        'periodo': ('periodo', lambda x: x if x else None),
        'puntualidad': ('puntualidad', convert_int),
        'calidad_trabajo': ('calidad_trabajo', convert_int),
        'actitud': ('actitud', convert_int),
        'iniciativa': ('iniciativa', convert_int),
        'cumplimiento': ('cumplimiento', convert_int),
        'comentario': ('comentario', lambda x: x if x else None),
        'fecha': ('fecha', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 16. Materiales_Recibidos
    total += import_table(conn, 'materiales_recibidos', 'Materiales_Recibidos', {
        'id': ('id', str),
        'tipo_material': ('tipo_material', str),
        'cantidad': ('cantidad', convert_number),
        'unidad': ('unidad', str),
        'fecha_recepcion': ('fecha_recepcion', str),
        'proveedor': ('donante', str),
        'estado': ('estado', lambda x: x if x else 'disponible'),
        'observaciones': ('observaciones', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 17. Electronicos_Reciclados (archivo vacío)
    total += import_table(conn, 'electronicos_reciclados', 'Electronicos_Reciclados', {
        'id': ('id', str),
        'tipo_dispositivo': ('tipo_dispositivo', str),
        'marca': ('marca', str),
        'modelo': ('modelo', str),
        'numero_serie': ('numero_serie', str),
        'estado': ('estado', str),
        'fecha_recepcion': ('fecha_recepcion', str),
        'donante': ('donante', str),
        'observaciones': ('observaciones', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 18. Salidas_Materiales
    total += import_table(conn, 'salidas_materiales', 'Salidas_Materiales', {
        'id': ('id', str),
        'material': ('material', lambda x: x if x else None),
        'cantidad': ('cantidad', convert_number),
        'destinatario': ('destinatario', lambda x: x if x else None),
        'fecha': ('fecha', str),
        'observaciones': ('observaciones', lambda x: x if x else None),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 19. Stock_Minimo (archivo vacío)
    total += import_table(conn, 'stock_minimo', 'Stock_Minimo', {
        'id': ('id', str),
        'tipo_material': ('tipo_material', str),
        'cantidad_minima': ('cantidad_minima', convert_number),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 20. Invitaciones
    total += import_table(conn, 'invitaciones', 'Invitaciones', {
        'id': ('id', str),
        'email': ('email', str),
        'rol': ('rol', str),
        'area': ('area', lambda x: x if x else None),
        'estado': ('estado', str),
        'usuario_id': ('usuario_id', str),
        'nombre_completo': ('nombre_completo', lambda x: x if x else None),
        'matricula': ('matricula', lambda x: x if x else None),
        'carrera': ('carrera', lambda x: x if x else None),
        'telefono': ('telefono', lambda x: x if x else None),
        'fecha_envio': ('fecha_envio', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 21. Respuestas_Encuesta
    total += import_table(conn, 'respuestas_encuesta', 'Respuestas_Encuesta', {
        'id': ('id', str),
        'encuesta': ('encuesta', str),
        'usuario': ('usuario', str),
        'respuestas': ('respuestas', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # 22. Bitacora_Auditoria
    total += import_table(conn, 'bitacora_auditoria', 'Bitacora_Auditoria', {
        'id': ('id', str),
        'usuario': ('usuario', str),
        'accion': ('accion', str),
        'entidad': ('entidad', lambda x: x if x else None),
        'entidad_id': ('entidad_id', lambda x: x if x else None),
        'detalles': ('detalles', str),
        'created_date': ('created_date', str),
        'updated_date': ('updated_date', str),
    })
    
    # Crear usuarios ficticios basados en los IDs encontrados en los datos
    print("\nCreando usuarios ficticios a partir de IDs de datos...")
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT usuario FROM asignaciones WHERE usuario NOT IN (SELECT id FROM users)")
    user_ids = [r[0] for r in cursor.fetchall()]
    cursor.execute("SELECT DISTINCT creado_por FROM pases_lista WHERE creado_por NOT IN (SELECT id FROM users)")
    user_ids += [r[0] for r in cursor.fetchall()]
    user_ids = list(set(user_ids))
    
    for uid in user_ids:
        if uid and uid.startswith('6a7'):
            cursor.execute("INSERT OR IGNORE INTO users (id, email, full_name, role) VALUES (?, ?, ?, ?)",
                           (uid, f"user_{uid[:8]}@ucp.local", f"Usuario {uid[:8]}", 'user'))
    
    conn.commit()
    
    # Contar usuarios creados
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"Usuarios en base de datos: {user_count}")
    print("\n⚠️  IMPORTANTE: Ejecuta 'node create-admin.js' para crear el usuario admin con password valido.")
    
    conn.close()
    return total
    print("\n👤 Creando usuarios ficticios a partir de IDs de datos...")
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT usuario FROM asignaciones WHERE usuario NOT IN (SELECT id FROM users)")
    user_ids = [r[0] for r in cursor.fetchall()]
    cursor.execute("SELECT DISTINCT creado_por FROM pases_lista WHERE creado_por NOT IN (SELECT id FROM users)")
    user_ids += [r[0] for r in cursor.fetchall()]
    user_ids = list(set(user_ids))
    
    # Usuario admin por defecto
    cursor.execute("INSERT OR IGNORE INTO users (id, email, password, full_name, role, area_encargada) VALUES (?, ?, ?, ?, ?, ?)",
                   ('admin-default', 'admin@ucp.local', '$2a$10$N9qo8uLOickgx2ZMRZoMye', 'Administrador', 'admin', 'General'))
    
    for uid in user_ids:
        if uid and uid.startswith('6a7'):
            cursor.execute("INSERT OR IGNORE INTO users (id, email, full_name, role) VALUES (?, ?, ?, ?)",
                           (uid, f"user_{uid[:8]}@ucp.local", f"Usuario {uid[:8]}", 'user'))
    
    conn.commit()
    
    # Contar usuarios creados
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"✅ Usuarios en base de datos: {user_count}")
    
    conn.close()
    return total

if __name__ == '__main__':
    print("🚀 Iniciando importación de datos CSV a SQLite...\n")
    init_db()
    total = import_all()
    print(f"\n🎉 Importación completada! Total: {total} registros importados.")
    print(f"📁 Base de datos: {DB_PATH}")
