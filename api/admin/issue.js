// POST /api/admin/issue
// Body:
//   {
//     training_id, city, issue_date, expires_at?,
//     attendees: [{ document_id, name, role?, company, document_type? }, ...]
//   }
// Upserts attendees + issues certificates. Returns per-company breakdown.

import { sql, json, error, handleError } from '../_db.js';
import { requireAuth } from '../_auth.js';

export default async function handler(req, res) {
  const user = requireAuth(req, res);
  if (!user) return;
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405);

  try {
    const body = await readBody(req);
    const trainingId = parseInt(body.training_id, 10);
    const city = String(body.city || '').trim().toUpperCase();
    const issueDate = String(body.issue_date || '').trim();
    const expiresAt = body.expires_at
      ? String(body.expires_at).trim()
      : addYearsISO(issueDate, 2);
    const attendees = Array.isArray(body.attendees) ? body.attendees : [];

    if (!trainingId) return error(res, 'Missing training_id', 400);
    if (!issueDate) return error(res, 'Missing issue_date (YYYY-MM-DD)', 400);
    if (!attendees.length) return error(res, 'Attendee list is empty', 400);

    const [training] = await sql`SELECT id, name FROM trainings WHERE id = ${trainingId}`;
    if (!training) return error(res, 'Training not found', 404);

    const results = {
      total: attendees.length,
      created_attendees: 0,
      issued_certificates: 0,
      skipped: 0,
      by_company: { FOCA: 0, VIU: 0 },
      errors: [],
    };

    const issuedBy = user.email || 'admin';

    for (const raw of attendees) {
      const documentId = String(raw.document_id || raw.cedula || '').trim();
      const name = String(raw.name || raw.nombre || '').trim().toUpperCase();
      const role = String(raw.role || raw.cargo || '').trim();
      const company = String(raw.company || raw.empresa || 'FOCA').trim().toUpperCase();
      const documentType = String(raw.document_type || raw.tipo_doc || 'C.C').trim();

      if (!documentId || !/^\d{4,15}$/.test(documentId)) {
        results.errors.push({ document_id: raw.document_id, reason: 'Invalid document number' });
        results.skipped++;
        continue;
      }
      if (!name) {
        results.errors.push({ document_id: documentId, reason: 'Name is empty' });
        results.skipped++;
        continue;
      }
      if (!['FOCA', 'VIU'].includes(company)) {
        results.errors.push({ document_id: documentId, reason: `Invalid company: ${company}` });
        results.skipped++;
        continue;
      }

      try {
        const [attendeeResult] = await sql`
          INSERT INTO attendees (document_id, document_type, name, role, company)
          VALUES (${documentId}, ${documentType}, ${name}, ${role}, ${company})
          ON CONFLICT (document_id) DO UPDATE
            SET name    = EXCLUDED.name,
                role    = EXCLUDED.role,
                company = EXCLUDED.company,
                active  = TRUE
          RETURNING (xmax = 0) AS created
        `;
        if (attendeeResult.created) results.created_attendees++;

        const existingCert = await sql`
          SELECT id FROM certificates
          WHERE document_id = ${documentId}
            AND training_id = ${trainingId}
            AND issue_date  = ${issueDate}
        `;
        if (existingCert.length > 0) {
          results.skipped++;
          results.errors.push({ document_id: documentId, reason: 'Already has certificate for this date' });
          continue;
        }

        // The PDF is rendered on demand from this row by api/certificate/[id].js,
        // so pdf_url is derived from the id rather than pointing at a file that
        // something would later have to produce and commit.
        const [created] = await sql`
          INSERT INTO certificates
            (document_id, training_id, city, issue_date, expires_at, issued_by)
          VALUES
            (${documentId}, ${trainingId}, ${city}, ${issueDate}, ${expiresAt}, ${issuedBy})
          RETURNING id
        `;
        await sql`
          UPDATE certificates SET pdf_url = ${'/api/certificate/' + created.id}
          WHERE id = ${created.id}
        `;
        results.issued_certificates++;
        results.by_company[company] = (results.by_company[company] || 0) + 1;
      } catch (e) {
        results.errors.push({ document_id: documentId, reason: e.message });
        results.skipped++;
      }
    }

    return json(res, { ok: true, ...results }, 201);
  } catch (e) {
    return handleError(res, e, 'admin/issue');
  }
}

function addYearsISO(dateStr, years) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
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
