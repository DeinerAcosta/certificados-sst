// GET    /api/capacitaciones          → lista todas
// POST   /api/capacitaciones          → crea una nueva
// PATCH  /api/capacitaciones?id=N     → edita una
// DELETE /api/capacitaciones?id=N     → borra (o desactiva si tiene certificados)

import { sql, json, error } from './_db.js';
import { requireAuth, isAuthenticated } from './_auth.js';

export default async function handler(req, res) {
  const id = req.query.id ? parseInt(req.query.id, 10) : null;

  // GET (sin id) es público. Todo lo demás requiere admin.
  if (!(req.method === 'GET' && !id) && !requireAuth(req, res)) return;

  try {
    // PATCH/PUT — editar una capacitación específica
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const body = await readBody(req);
      const [actual] = await sql`SELECT * FROM capacitaciones WHERE id = ${id}`;
      if (!actual) return error(res, 'No existe', 404);
      const [cap] = await sql`
        UPDATE capacitaciones SET
          nombre = ${body.nombre ?? actual.nombre},
          horas = ${body.horas ?? actual.horas},
          vigencia_anos = ${body.vigencia_anos ?? actual.vigencia_anos},
          empresa = ${body.empresa ?? actual.empresa},
          categoria = ${body.categoria ?? actual.categoria},
          descripcion = ${body.descripcion ?? actual.descripcion},
          activa = ${body.activa ?? actual.activa}
        WHERE id = ${id}
        RETURNING *
      `;
      return json(res, { ok: true, capacitacion: cap });
    }

    // DELETE — desactivar (soft) si tiene certificados; borrar si no
    if (req.method === 'DELETE' && id) {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM certificados WHERE capacitacion_id = ${id}
      `;
      if (count > 0) {
        await sql`UPDATE capacitaciones SET activa = FALSE WHERE id = ${id}`;
        return json(res, { ok: true, action: 'desactivada', certificados_existentes: count });
      }
      await sql`DELETE FROM capacitaciones WHERE id = ${id}`;
      return json(res, { ok: true, action: 'eliminada' });
    }

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
