// POST /api/certificados → emitir certificado(s)
//   body simple:      { cedula, capacitacion_id, ciudad, fecha, valido_hasta, pdf_url }
//   body masivo:      { cedulas: [...], capacitacion_id, ciudad, fecha, valido_hasta }

import { sql, json, error } from './_db.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT
          c.id,
          c.cedula,
          p.nombre,
          cap.nombre AS capacitacion,
          c.ciudad,
          c.fecha,
          c.valido_hasta,
          c.pdf_url,
          c.emitido_por,
          c.created_at
        FROM certificados c
        JOIN personas p ON p.cedula = c.cedula
        JOIN capacitaciones cap ON cap.id = c.capacitacion_id
        ORDER BY c.created_at DESC
        LIMIT 200
      `;
      return json(res, { certificados: rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const {
        cedula,
        cedulas,
        capacitacion_id,
        ciudad = '',
        fecha,
        valido_hasta,
        pdf_url = null,
        emitido_por = 'admin',
      } = body;

      if (!capacitacion_id || !fecha) {
        return error(res, 'Faltan: capacitacion_id, fecha', 400);
      }

      const lista = cedulas && cedulas.length
        ? cedulas
        : (cedula ? [cedula] : []);

      if (!lista.length) {
        return error(res, 'Falta cedula o cedulas', 400);
      }

      const validoHasta = valido_hasta || calcVigencia(fecha, capacitacion_id);

      const inserted = [];
      for (const cc of lista) {
        const pdfPath = pdf_url ?? `pdfs/${cc}.pdf`;
        const [row] = await sql`
          INSERT INTO certificados
            (cedula, capacitacion_id, ciudad, fecha, valido_hasta, pdf_url, emitido_por)
          VALUES
            (${cc}, ${capacitacion_id}, ${ciudad},
             ${fecha}, ${validoHasta}, ${pdfPath}, ${emitido_por})
          RETURNING id, cedula
        `;
        inserted.push(row);
      }
      return json(res, { ok: true, emitidos: inserted.length, certificados: inserted }, 201);
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return error(res, e.message);
  }
}

function calcVigencia(fechaStr, _capId) {
  const d = new Date(fechaStr);
  d.setFullYear(d.getFullYear() + 2); // default 2 años
  return d.toISOString().slice(0, 10);
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
