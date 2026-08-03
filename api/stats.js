// GET /api/stats  → estadísticas reales para el dashboard admin

import { sql, json, error } from './_db.js';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const [{ personas }]        = await sql`SELECT COUNT(*)::int AS personas FROM personas WHERE activo`;
    const [{ certificados }]    = await sql`SELECT COUNT(*)::int AS certificados FROM certificados`;
    const [{ capacitaciones }]  = await sql`SELECT COUNT(*)::int AS capacitaciones FROM capacitaciones WHERE activa`;
    const [{ usuarios }]        = await sql`SELECT COUNT(*)::int AS usuarios FROM usuarios WHERE activo`;

    const [{ ultimo_mes }] = await sql`
      SELECT COUNT(*)::int AS ultimo_mes
      FROM certificados
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    // Nombres de capacitaciones activas
    const cursos = await sql`
      SELECT nombre FROM capacitaciones WHERE activa ORDER BY nombre
    `;

    // Actividad reciente: últimas 10 emisiones
    const actividad = await sql`
      SELECT
        c.created_at AS fecha,
        'Emisión' AS accion,
        cap.nombre || ' · ' || p.nombre AS detalle,
        COALESCE(c.emitido_por, 'admin') AS por
      FROM certificados c
      JOIN personas p ON p.cedula = c.cedula
      JOIN capacitaciones cap ON cap.id = c.capacitacion_id
      ORDER BY c.created_at DESC
      LIMIT 10
    `;

    // Ciudades ya usadas (para el datalist de sugerencias)
    const ciudadesUsadas = await sql`
      SELECT DISTINCT ciudad FROM certificados
      WHERE ciudad IS NOT NULL AND ciudad != ''
      ORDER BY ciudad
    `;
    const CIUDADES_DEFAULT = ['BARRANQUILLA','CARTAGENA','SANTA MARTA','VALLEDUPAR','RIOHACHA'];
    const ciudades = Array.from(new Set([
      ...ciudadesUsadas.map(c => c.ciudad.toUpperCase().trim()),
      ...CIUDADES_DEFAULT,
    ])).sort();

    return json(res, {
      totales: {
        personas,
        certificados,
        capacitaciones,
        usuarios,
        ultimo_mes,
      },
      cursos_activos: cursos.map(c => c.nombre),
      ciudades,
      actividad_reciente: actividad,
    });
  } catch (e) {
    return error(res, e.message);
  }
}
