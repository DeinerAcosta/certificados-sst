// GET /api/admin/stats — dashboard counters + recent activity + city list

import { sql, json, error } from '../_db.js';
import { requireAuth } from '../_auth.js';

const DEFAULT_CITIES = ['BARRANQUILLA', 'CARTAGENA', 'SANTA MARTA', 'VALLEDUPAR', 'RIOHACHA'];

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const [{ attendees }]    = await sql`SELECT COUNT(*)::int AS attendees    FROM attendees WHERE active`;
    const [{ certificates }] = await sql`SELECT COUNT(*)::int AS certificates FROM certificates`;
    const [{ trainings }]    = await sql`SELECT COUNT(*)::int AS trainings    FROM trainings WHERE active`;
    const [{ users }]        = await sql`SELECT COUNT(*)::int AS users        FROM users WHERE active`;

    const [{ last_month }] = await sql`
      SELECT COUNT(*)::int AS last_month
      FROM certificates
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `;

    const activeTrainings = await sql`
      SELECT name FROM trainings WHERE active ORDER BY name
    `;

    const recentActivity = await sql`
      SELECT
        c.created_at AS at,
        'Issuance' AS action,
        t.name || ' · ' || a.name AS detail,
        COALESCE(c.issued_by, 'admin') AS by_user
      FROM certificates c
      JOIN attendees a ON a.document_id = c.document_id
      JOIN trainings t ON t.id = c.training_id
      ORDER BY c.created_at DESC
      LIMIT 10
    `;

    const usedCities = await sql`
      SELECT DISTINCT city FROM certificates
      WHERE city IS NOT NULL AND city != ''
      ORDER BY city
    `;
    const cities = Array.from(new Set([
      ...usedCities.map(c => c.city.toUpperCase().trim()),
      ...DEFAULT_CITIES,
    ])).sort();

    return json(res, {
      totals: {
        attendees,
        certificates,
        trainings,
        users,
        last_month,
      },
      active_trainings: activeTrainings.map(t => t.name),
      recent_activity: recentActivity,
      cities,
    });
  } catch (e) {
    return error(res, e.message);
  }
}
