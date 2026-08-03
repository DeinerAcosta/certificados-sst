// PATCH   /api/capacitacion?id=N  → editar capacitación
// DELETE  /api/capacitacion?id=N  → desactivar (o borrar si no tiene certificados)

import { sql, json, error } from './_db.js';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const id = parseInt(req.query.id, 10);
  if (!id) return error(res, 'Falta ?id=', 400);

  try {
    if (req.method === 'GET') {
      const [cap] = await sql`SELECT * FROM capacitaciones WHERE id = ${id}`;
      if (!cap) return error(res, 'No existe', 404);
      return json(res, { capacitacion: cap });
    }

    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = await readBody(req);
      const [cap] = await sql`
        UPDATE capacitaciones SET
          nombre = COALESCE(${body.nombre ?? null}, nombre),
          horas = COALESCE(${body.horas ?? null}, horas),
          vigencia_anos = COALESCE(${body.vigencia_anos ?? null}, vigencia_anos),
          empresa = COALESCE(${body.empresa ?? null}, empresa),
          categoria = COALESCE(${body.categoria ?? null}, categoria),
          descripcion = COALESCE(${body.descripcion ?? null}, descripcion),
          activa = COALESCE(${body.activa ?? null}, activa)
        WHERE id = ${id}
        RETURNING *
      `;
      if (!cap) return error(res, 'No existe', 404);
      return json(res, { ok: true, capacitacion: cap });
    }

    if (req.method === 'DELETE') {
      // Si tiene certificados emitidos, solo desactivar (soft delete)
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM certificados WHERE capacitacion_id = ${id}
      `;
      if (count > 0) {
        await sql`UPDATE capacitaciones SET activa = FALSE WHERE id = ${id}`;
        return json(res, { ok: true, action: 'desactivada', certificados_existentes: count });
      }
      // Sin certificados → borrar del todo
      await sql`DELETE FROM capacitaciones WHERE id = ${id}`;
      return json(res, { ok: true, action: 'eliminada' });
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
