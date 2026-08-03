// POST /api/emitir
//   body: {
//     capacitacion_id: 1,
//     ciudad: "BARRANQUILLA",
//     fecha: "2026-03-15",
//     valido_hasta: "2028-03-15",   (opcional, calculado si no viene)
//     asistentes: [
//       { cedula, nombre, cargo?, empresa, tipo_doc? },
//       ...
//     ]
//   }
//
// Comportamiento:
//   1. Crea o actualiza cada persona (upsert por cédula)
//   2. Emite el certificado para cada una
//   3. Devuelve resumen: cuántos creados, cuántos re-emitidos, errores

import { sql, json, error } from './_db.js';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    const body = await readBody(req);
    const capacitacion_id = parseInt(body.capacitacion_id, 10);
    const ciudad = String(body.ciudad || '').trim().toUpperCase();
    const fecha = String(body.fecha || '').trim();
    const valido_hasta = body.valido_hasta
      ? String(body.valido_hasta).trim()
      : calcVigencia(fecha);
    const asistentes = Array.isArray(body.asistentes) ? body.asistentes : [];

    if (!capacitacion_id) return error(res, 'Falta capacitacion_id', 400);
    if (!fecha) return error(res, 'Falta fecha (YYYY-MM-DD)', 400);
    if (!asistentes.length) return error(res, 'Lista de asistentes vacía', 400);

    // Verificar que la capacitación existe
    const [cap] = await sql`
      SELECT id, nombre FROM capacitaciones WHERE id = ${capacitacion_id}
    `;
    if (!cap) return error(res, 'La capacitación no existe', 404);

    const resultados = {
      total: asistentes.length,
      personas_creadas: 0,
      certificados_emitidos: 0,
      omitidos: 0,
      errores: [],
    };

    const quienEmite = user.email || 'admin';

    for (const raw of asistentes) {
      const cedula = String(raw.cedula || '').trim();
      const nombre = String(raw.nombre || '').trim().toUpperCase();
      const cargo = String(raw.cargo || '').trim();
      const empresa = String(raw.empresa || 'FOCA').trim().toUpperCase();
      const tipo_doc = String(raw.tipo_doc || 'C.C').trim();

      if (!cedula || !/^\d{4,15}$/.test(cedula)) {
        resultados.errores.push({ cedula: raw.cedula, motivo: 'Cédula inválida' });
        resultados.omitidos++;
        continue;
      }
      if (!nombre) {
        resultados.errores.push({ cedula, motivo: 'Nombre vacío' });
        resultados.omitidos++;
        continue;
      }
      if (!['FOCA', 'VIU'].includes(empresa)) {
        resultados.errores.push({ cedula, motivo: `Empresa inválida: ${empresa}` });
        resultados.omitidos++;
        continue;
      }

      try {
        // 1. Upsert de persona
        const [personaResult] = await sql`
          INSERT INTO personas (cedula, tipo_doc, nombre, cargo, empresa)
          VALUES (${cedula}, ${tipo_doc}, ${nombre}, ${cargo}, ${empresa})
          ON CONFLICT (cedula) DO UPDATE
            SET nombre  = EXCLUDED.nombre,
                cargo   = EXCLUDED.cargo,
                empresa = EXCLUDED.empresa,
                activo  = TRUE
          RETURNING (xmax = 0) AS creada
        `;
        if (personaResult.creada) resultados.personas_creadas++;

        // 2. Insertar certificado (evita duplicados de misma capacitación misma fecha)
        const existe = await sql`
          SELECT id FROM certificados
          WHERE cedula = ${cedula}
            AND capacitacion_id = ${capacitacion_id}
            AND fecha = ${fecha}
        `;
        if (existe.length > 0) {
          resultados.omitidos++;
          resultados.errores.push({ cedula, motivo: 'Ya tiene certificado en esa fecha' });
          continue;
        }

        await sql`
          INSERT INTO certificados
            (cedula, capacitacion_id, ciudad, fecha, valido_hasta, pdf_url, emitido_por)
          VALUES
            (${cedula}, ${capacitacion_id}, ${ciudad},
             ${fecha}, ${valido_hasta}, ${'pdfs/' + cedula + '.pdf'}, ${quienEmite})
        `;
        resultados.certificados_emitidos++;
      } catch (e) {
        resultados.errores.push({ cedula, motivo: e.message });
        resultados.omitidos++;
      }
    }

    return json(res, { ok: true, ...resultados }, 201);
  } catch (e) {
    return error(res, e.message);
  }
}

function calcVigencia(fechaStr) {
  const d = new Date(fechaStr);
  d.setFullYear(d.getFullYear() + 2);
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
