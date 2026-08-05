// GET    /api/admin/trainings                    → list all
// POST   /api/admin/trainings                    → create new
// PATCH  /api/admin/trainings?id=N               → update
// DELETE /api/admin/trainings?id=N               → delete or deactivate
// GET    /api/admin/trainings?id=N&download=foca → download template file

import { sql, json, error, handleError } from '../_db.js';
import { requireAuth } from '../_auth.js';

export default async function handler(req, res) {
  const id = req.query.id ? parseInt(req.query.id, 10) : null;

  // GET without id is public; anything else requires admin
  if (!(req.method === 'GET' && !id) && !requireAuth(req, res)) return;

  try {
    // PATCH — update training
    if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
      const body = await readBody(req);
      const [current] = await sql`SELECT * FROM trainings WHERE id = ${id}`;
      if (!current) return error(res, 'Training not found', 404);

      const [updated] = await sql`
        UPDATE trainings SET
          name                = ${body.name           ?? current.name},
          hours               = ${body.hours          ?? current.hours},
          validity_years      = ${body.validity_years ?? current.validity_years},
          company             = ${body.company        ?? current.company},
          category            = ${body.category       ?? current.category},
          description         = ${body.description    ?? current.description},
          active              = ${body.active         ?? current.active},
          template_foca_name  = ${body.template_foca_name ?? current.template_foca_name},
          template_foca_data  = ${body.template_foca_data ?? current.template_foca_data},
          template_viu_name   = ${body.template_viu_name  ?? current.template_viu_name},
          template_viu_data   = ${body.template_viu_data  ?? current.template_viu_data}
        WHERE id = ${id}
        RETURNING id, name, hours, company
      `;
      return json(res, { ok: true, training: updated });
    }

    // DELETE — soft-delete if certificates exist, hard-delete otherwise
    if (req.method === 'DELETE' && id) {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM certificates WHERE training_id = ${id}
      `;
      if (count > 0) {
        await sql`UPDATE trainings SET active = FALSE WHERE id = ${id}`;
        return json(res, { ok: true, action: 'deactivated', existing_certificates: count });
      }
      await sql`DELETE FROM trainings WHERE id = ${id}`;
      return json(res, { ok: true, action: 'deleted' });
    }

    // GET — download template file (if ?download=foca|viu)
    if (req.method === 'GET') {
      const which = req.query.download;
      if (id && which) {
        const rows = which === 'viu'
          ? await sql`SELECT template_viu_name AS name, template_viu_data AS data FROM trainings WHERE id = ${id}`
          : await sql`SELECT template_foca_name AS name, template_foca_data AS data FROM trainings WHERE id = ${id}`;
        if (!rows.length || !rows[0].data) return error(res, 'No template', 404);
        const buf = Buffer.from(rows[0].data, 'base64');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename="${rows[0].name || 'template.docx'}"`);
        return res.end(buf);
      }

      // GET list — omit heavy base64 data
      const rows = await sql`
        SELECT t.id, t.name, t.description, t.hours, t.validity_years,
               t.company, t.category, t.active,
               t.template_foca_name,
               t.template_viu_name,
               (t.template_foca_data IS NOT NULL) AS has_template_foca,
               (t.template_viu_data  IS NOT NULL) AS has_template_viu,
               COUNT(c.id)::int AS issued_count
        FROM trainings t
        LEFT JOIN certificates c ON c.training_id = t.id
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `;
      return json(res, { trainings: rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const {
        name,
        hours,
        validity_years = 2,
        company = 'AMBAS',
        category = 'SST',
        description = '',
        template_foca_name = null,
        template_foca_data = null,
        template_viu_name  = null,
        template_viu_data  = null,
      } = body;

      if (!name || !hours) {
        return error(res, 'Missing fields: name, hours', 400);
      }

      const [training] = await sql`
        INSERT INTO trainings
          (name, hours, validity_years, company, category, description,
           template_foca_name, template_foca_data,
           template_viu_name,  template_viu_data)
        VALUES
          (${name}, ${hours}, ${validity_years}, ${company},
           ${category}, ${description},
           ${template_foca_name}, ${template_foca_data},
           ${template_viu_name},  ${template_viu_data})
        RETURNING id, name, hours, company
      `;
      return json(res, { ok: true, training }, 201);
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return handleError(res, e, 'admin/trainings');
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
