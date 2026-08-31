// GET /api/admin/certificates → list all issued certificates (with joins)

import { sql, json, error, handleError } from '../_db.js';
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
          c.issued_by,
          c.created_at
        FROM certificates c
        JOIN attendees a ON a.document_id = c.document_id
        JOIN trainings t ON t.id = c.training_id
        ORDER BY c.created_at DESC
        LIMIT 500
      `;
      // The stored pdf_url is ignored: rows issued before certificates were
      // generated server-side point at static files that were never created.
      // The route below always works, for every row.
      return json(res, {
        certificates: rows.map(c => ({ ...c, pdf_url: `/api/certificate/${c.id}` })),
      });
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return handleError(res, e, 'admin/certificates');
  }
}
