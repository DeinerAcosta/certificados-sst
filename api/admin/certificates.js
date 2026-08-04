// GET /api/admin/certificates → list all issued certificates (with joins)

import { sql, json, error } from '../_db.js';
import { requireAuth } from '../_auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT
          c.id,
          c.document_id     AS document_id,
          a.name            AS attendee_name,
          t.name            AS training_name,
          c.city,
          c.issue_date,
          c.expires_at,
          c.pdf_url,
          c.issued_by,
          c.created_at
        FROM certificates c
        JOIN attendees a ON a.document_id = c.document_id
        JOIN trainings t ON t.id = c.training_id
        ORDER BY c.created_at DESC
        LIMIT 500
      `;
      return json(res, { certificates: rows });
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return error(res, e.message);
  }
}
