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
          activa = ${body.activa ?? actual.activa},
          plantilla_foca_nombre = ${body.plantilla_foca_nombre ?? actual.plantilla_foca_nombre},
          plantilla_foca_data   = ${body.plantilla_foca_data   ?? actual.plantilla_foca_data},
          plantilla_viu_nombre  = ${body.plantilla_viu_nombre  ?? actual.plantilla_viu_nombre},
          plantilla_viu_data    = ${body.plantilla_viu_data    ?? actual.plantilla_viu_data}
        WHERE id = ${id}
        RETURNING id, nombre, horas, empresa
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
      // Si piden ?descargar=foca|viu junto con ?id=N → devolver la plantilla
      const descargar = req.query.descargar;
      if (id && descargar) {
        const col = descargar === 'viu' ? 'plantilla_viu' : 'plantilla_foca';
        const rows = descargar === 'viu'
          ? await sql`SELECT plantilla_viu_nombre AS nombre, plantilla_viu_data AS data FROM capacitaciones WHERE id = ${id}`
          : await sql`SELECT plantilla_foca_nombre AS nombre, plantilla_foca_data AS data FROM capacitaciones WHERE id = ${id}`;
        if (!rows.length || !rows[0].data) return error(res, 'Sin plantilla', 404);
        const buf = Buffer.from(rows[0].data, 'base64');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${rows[0].nombre || 'plantilla.docx'}"`);
        return res.end(buf);
      }

      // GET normal — lista sin la data pesada, solo nombres
      const rows = await sql`
        SELECT c.id, c.nombre, c.descripcion, c.horas, c.vigencia_anos,
               c.empresa, c.categoria, c.activa,
               c.plantilla_foca_nombre,
               c.plantilla_viu_nombre,
               (c.plantilla_foca_data IS NOT NULL) AS tiene_plantilla_foca,
               (c.plantilla_viu_data  IS NOT NULL) AS tiene_plantilla_viu,
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
        plantilla_foca_nombre = null,
        plantilla_foca_data   = null,   // base64 del .docx (opcional)
        plantilla_viu_nombre  = null,
        plantilla_viu_data    = null,
      } = body;

      if (!nombre || !horas) {
        return error(res, 'Faltan campos: nombre, horas', 400);
      }

      const [cap] = await sql`
        INSERT INTO capacitaciones
          (nombre, horas, vigencia_anos, empresa, categoria, descripcion,
           plantilla_foca_nombre, plantilla_foca_data,
           plantilla_viu_nombre,  plantilla_viu_data)
        VALUES
          (${nombre}, ${horas}, ${vigencia_anos}, ${empresa},
           ${categoria}, ${descripcion},
           ${plantilla_foca_nombre}, ${plantilla_foca_data},
           ${plantilla_viu_nombre},  ${plantilla_viu_data})
        RETURNING id, nombre, horas, vigencia_anos, empresa, categoria
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
