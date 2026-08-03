// GET /api/ciudades → devuelve las ciudades donde ya se han emitido certificados
// (para poblar el datalist de sugerencias en Emitir Certificados)

import { sql, json, error } from './_db.js';
import { requireAuth } from './_auth.js';

// Ciudades sugeridas por defecto (donde FOCA/VIU opera)
const CIUDADES_DEFAULT = [
  'BARRANQUILLA',
  'CARTAGENA',
  'SANTA MARTA',
  'VALLEDUPAR',
  'RIOHACHA',
];

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    // Ciudades usadas en certificados existentes
    const rows = await sql`
      SELECT DISTINCT ciudad
      FROM certificados
      WHERE ciudad IS NOT NULL AND ciudad != ''
      ORDER BY ciudad
    `;

    // Combinar: usadas + defaults, sin duplicados
    const usadas = rows.map(r => r.ciudad.toUpperCase().trim());
    const ciudades = Array.from(new Set([...usadas, ...CIUDADES_DEFAULT])).sort();

    return json(res, { ciudades });
  } catch (e) {
    return error(res, e.message);
  }
}
