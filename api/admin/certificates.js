// GET    /api/admin/certificates            → list all issued certificates
// DELETE /api/admin/certificates?id=N        → delete one certificate
// DELETE /api/admin/certificates  {ids:[…]}  → delete many
//
// Deleting also removes any attendee left with no certificates at all, so
// clearing a batch of test data does not leave orphaned people behind. An
// attendee who still holds a certificate elsewhere is kept.

import { sql, json, error, handleError } from '../_db.js';
import { requireAuth } from '../_auth.js';

/** Certificates the admin list can show at once; the same ceiling applies to
 *  a single delete request so one call cannot run unbounded. */
const MAX_BATCH = 500;

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'DELETE') {
      const ids = await collectIds(req);
      if (!ids.length) return error(res, 'No certificate ids given', 400);
      if (ids.length > MAX_BATCH) {
        return error(res, `Too many certificates in one request (max ${MAX_BATCH})`, 400);
      }

      // Read the owners before the rows go away — afterwards there is no way
      // to tell which people were involved.
      const owners = await sql`
        SELECT DISTINCT document_id FROM certificates WHERE id = ANY(${ids}::int[])
      `;
      if (!owners.length) return error(res, 'No matching certificates', 404);

      const deleted = await sql`
        DELETE FROM certificates WHERE id = ANY(${ids}::int[]) RETURNING id
      `;

      const documentIds = owners.map(o => o.document_id);
      const orphans = await sql`
        DELETE FROM attendees a
        WHERE a.document_id = ANY(${documentIds}::text[])
          AND NOT EXISTS (
            SELECT 1 FROM certificates c WHERE c.document_id = a.document_id
          )
        RETURNING a.document_id
      `;

      return json(res, {
        ok: true,
        deleted_certificates: deleted.length,
        deleted_attendees: orphans.length,
      });
    }

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

/** Ids to delete, from ?id=N or from a JSON body {ids:[…]}. Anything that is
 *  not a positive integer is dropped rather than reaching the query. */
async function collectIds(req) {
  const raw = req.query.id
    ? [req.query.id]
    : (await readBody(req)).ids;
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .map(v => parseInt(v, 10))
    .filter(n => Number.isInteger(n) && n > 0);
  return [...new Set(ids)];
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
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
