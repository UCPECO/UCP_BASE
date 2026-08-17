import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../database.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// Mapeo de nombres de entidades a tablas
const entityMap = {
  'User': 'users',
  'Actividades': 'actividades',
  'Asignaciones': 'asignaciones',
  'Registros_QR': 'registros_qr',
  'Evidencias': 'evidencias',
  'Bonos': 'bonos',
  'Incidencias': 'incidencias',
  'Horarios_Clase': 'horarios_clase',
  'Eventos': 'eventos',
  'Constancias': 'constancias',
  'Encuestas': 'encuestas',
  'Respuestas_Encuesta': 'respuestas_encuesta',
  'Evaluaciones_Alumno': 'evaluaciones_alumno',
  'Materiales_Recibidos': 'materiales_recibidos',
  'Electronicos_Reciclados': 'electronicos_reciclados',
  'Salidas_Materiales': 'salidas_materiales',
  'Stock_Minimo': 'stock_minimo',
  'Codigos_QR': 'codigos_qr',
  'Pases_Lista': 'pases_lista',
  'Respuestas_Pases_Lista': 'respuestas_pases_lista',
  'Invitaciones': 'invitaciones',
  'Configuracion_Sistema': 'configuracion_sistema',
  'Bitacora_Auditoria': 'bitacora_auditoria'
};

function getTable(entityName) {
  return entityMap[entityName] || entityName.toLowerCase();
}

function snakeToCamel(obj) {
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = value;
    }
    return result;
  }
  return obj;
}

// LIST - GET /api/:entity
router.get('/:entity', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  const { sort, limit, ...filters } = req.query;
  
  try {
    let query = `SELECT * FROM ${table}`;
    const params = [];
    
    // Aplicar filtros
    const filterKeys = Object.keys(filters).filter(k => k !== 'sort' && k !== 'limit');
    if (filterKeys.length > 0) {
      const conditions = filterKeys.map(k => {
        params.push(filters[k]);
        return `${k} = ?`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    // Ordenar
    if (sort) {
      const direction = sort.startsWith('-') ? 'DESC' : 'ASC';
      const column = sort.startsWith('-') ? sort.slice(1) : sort;
      query += ` ORDER BY ${column} ${direction}`;
    } else {
      query += ` ORDER BY created_date DESC`;
    }
    
    // Limitar
    if (limit) {
      query += ` LIMIT ?`;
      params.push(parseInt(limit));
    }
    
    const rows = db.prepare(query).all(...params);
    res.json(snakeToCamel(rows));
  } catch (error) {
    console.error('LIST error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET ONE - GET /api/:entity/:id
router.get('/:entity/:id', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  
  try {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'No encontrado' });
    res.json(snakeToCamel(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE - POST /api/:entity
router.post('/:entity', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  const data = req.body;
  
  try {
    const id = data.id || uuidv4();
    const fields = Object.keys(data);
    const values = fields.map(f => data[f]);
    
    // Agregar id si no está
    if (!fields.includes('id')) {
      fields.unshift('id');
      values.unshift(id);
    }
    
    const placeholders = fields.map(() => '?').join(', ');
    db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);
    
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    res.status(201).json(snakeToCamel(row));
  } catch (error) {
    console.error('CREATE error:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE - PUT /api/:entity/:id
router.put('/:entity/:id', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  const data = req.body;
  
  try {
    const fields = Object.keys(data);
    if (fields.length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => data[f]);
    values.push(req.params.id);
    
    db.prepare(`UPDATE ${table} SET ${setClause}, updated_date = datetime('now') WHERE id = ?`).run(...values);
    
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
    res.json(snakeToCamel(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE - DELETE /api/:entity/:id
router.delete('/:entity/:id', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  
  try {
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// BULK CREATE - POST /api/:entity/bulk
router.post('/:entity/bulk', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  const items = req.body;
  
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Se esperaba un array' });
  }
  
  try {
    const created = [];
    for (const data of items) {
      const id = data.id || uuidv4();
      const fields = Object.keys(data);
      const values = fields.map(f => data[f]);
      
      if (!fields.includes('id')) {
        fields.unshift('id');
        values.unshift(id);
      }
      
      const placeholders = fields.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`).run(...values);
      
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
      created.push(snakeToCamel(row));
    }
    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE MANY - PUT /api/:entity/bulk
router.put('/:entity/bulk', authMiddleware, (req, res) => {
  const table = getTable(req.params.entity);
  const { filter, $set } = req.body;
  
  try {
    let query = `UPDATE ${table} SET `;
    const fields = Object.keys($set || {});
    if (fields.length === 0) return res.status(400).json({ error: 'No hay datos para actualizar' });
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => $set[f]);
    query += setClause;
    
    if (filter && Object.keys(filter).length > 0) {
      const conditions = Object.keys(filter).map(k => {
        values.push(filter[k]);
        return `${k} = ?`;
      });
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    const result = db.prepare(query).run(...values);
    res.json({ updated: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
