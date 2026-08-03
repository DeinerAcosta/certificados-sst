// GET /api/lookup?cc=1045737800
// Devuelve persona + sus certificados (equivalente a lo que hace CAEM)

import { sql, json, error } from './_db.js';

export default async function handler(req, res) {
  const cc = String(req.query.cc || '').trim();
  if (!/^\d{4,15}$/.test(cc)) {
    return error(res, 'Cédula inválida', 400);
  }

  try {
    const [persona] = await sql`
      SELECT cedula, tipo_doc, nombre, cargo, empresa
      FROM personas
      WHERE cedula = ${cc} AND activo = TRUE
      LIMIT 1
    `;

    if (!persona) {
      return json(res, { encontrado: false });
    }

    const certificados = await sql`
      SELECT
        c.id,
        cap.nombre           AS titulo,
        cap.horas            AS horas,
        c.fecha              AS fecha,
        c.valido_hasta       AS valido_hasta,
        c.ciudad             AS ciudad,
        c.pdf_url            AS pdf
      FROM certificados c
      JOIN capacitaciones cap ON cap.id = c.capacitacion_id
      WHERE c.cedula = ${cc}
      ORDER BY c.fecha DESC
    `;

    return json(res, {
      encontrado: true,
      persona: {
        cedula: persona.cedula,
        documento: `${persona.tipo_doc} ${persona.cedula}`,
        nombre: persona.nombre,
        cargo: persona.cargo,
        empresa: persona.empresa,
      },
      certificados: certificados.map(c => ({
        titulo: c.titulo,
        fecha: fmtFecha(c.fecha),
        valido_hasta: fmtFecha(c.valido_hasta),
        horas: c.horas,
        ciudad: c.ciudad,
        pdf: c.pdf,
      })),
    });
  } catch (e) {
    return error(res, `Consulta falló: ${e.message}`);
  }
}

function fmtFecha(d) {
  if (!d) return '—';
  const date = new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
