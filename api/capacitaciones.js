// GET  /api/capacitaciones → lista todas
// POST /api/capacitaciones → crea una nueva
//   body: { nombre, horas, vigencia_anos, empresa, categoria, descripcion, plantilla_url }

import { sql, json, error } from './_db.js';
import { requireAuth, isAuthenticated } from './_auth.js';

export default async function handler(req, res) {
  // GET es público (listado de cursos disponibles); POST solo admin
  if (req.method !== 'GET' && !requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT c.id, c.nombre, c.descripcion, c.horas, c.vigencia_anos,
               c.empresa, c.categoria, c.plantilla_url, c.activa,
               COUNT(ct.id)::int AS emitidos
        FROM capacitaciones c
        LEFT JOIN certificados ct ON ct.capacitacion_id = c.id
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `;
      return json(res, { capacitaciones: rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const {
        nombre,
        horas,
        vigencia_anos = 2,
        empresa = 'AMBAS',
        categoria = 'SST',
        descripcion = '',
        plantilla_url = null,
      } = body;

      if (!nombre || !horas) {
        return error(res, 'Faltan campos: nombre, horas', 400);
      }

      const [cap] = await sql`
        INSERT INTO capacitaciones
          (nombre, horas, vigencia_anos, empresa, categoria, descripcion, plantilla_url)
        VALUES
          (${nombre}, ${horas}, ${vigencia_anos}, ${empresa},
           ${categoria}, ${descripcion}, ${plantilla_url})
        RETURNING *
      `;
      return json(res, { ok: true, capacitacion: cap }, 201);
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return error(res, e.message);
  }
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
