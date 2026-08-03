// GET  /api/personas         → lista todas
// POST /api/personas         → agrega una nueva
//   body: { cedula, tipo_doc, nombre, cargo, empresa }
// DELETE /api/personas?cc=X  → desactiva (soft delete)

import { sql, json, error } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const search = String(req.query.q || '').trim();
      const empresa = String(req.query.empresa || '').trim();

      let rows;
      if (search) {
        const pat = `%${search}%`;
        rows = await sql`
          SELECT p.cedula, p.tipo_doc, p.nombre, p.cargo, p.empresa,
                 COUNT(c.id)::int AS certificados
          FROM personas p
          LEFT JOIN certificados c ON c.cedula = p.cedula
          WHERE p.activo = TRUE
            AND (p.nombre ILIKE ${pat} OR p.cedula ILIKE ${pat})
            ${empresa ? sql`AND p.empresa = ${empresa}` : sql``}
          GROUP BY p.cedula
          ORDER BY p.nombre
          LIMIT 100
        `;
      } else {
        rows = await sql`
          SELECT p.cedula, p.tipo_doc, p.nombre, p.cargo, p.empresa,
                 COUNT(c.id)::int AS certificados
          FROM personas p
          LEFT JOIN certificados c ON c.cedula = p.cedula
          WHERE p.activo = TRUE
            ${empresa ? sql`AND p.empresa = ${empresa}` : sql``}
          GROUP BY p.cedula
          ORDER BY p.nombre
          LIMIT 100
        `;
      }

      return json(res, { personas: rows, total: rows.length });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const { cedula, tipo_doc = 'C.C', nombre, cargo = '', empresa } = body;

      if (!cedula || !nombre || !empresa) {
        return error(res, 'Faltan campos: cedula, nombre, empresa', 400);
      }
      if (!/^\d{4,15}$/.test(cedula)) {
        return error(res, 'Cédula inválida', 400);
      }
      if (!['FOCA', 'VIU'].includes(empresa)) {
        return error(res, 'Empresa debe ser FOCA o VIU', 400);
      }

      const [persona] = await sql`
        INSERT INTO personas (cedula, tipo_doc, nombre, cargo, empresa)
        VALUES (${cedula}, ${tipo_doc}, ${nombre.toUpperCase()}, ${cargo}, ${empresa})
        ON CONFLICT (cedula) DO UPDATE
          SET nombre = EXCLUDED.nombre,
              cargo  = EXCLUDED.cargo,
              empresa = EXCLUDED.empresa,
              activo = TRUE
        RETURNING *
      `;

      return json(res, { ok: true, persona }, 201);
    }

    if (req.method === 'DELETE') {
      const cc = String(req.query.cc || '').trim();
      if (!cc) return error(res, 'Falta ?cc=', 400);
      await sql`UPDATE personas SET activo = FALSE WHERE cedula = ${cc}`;
      return json(res, { ok: true });
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
