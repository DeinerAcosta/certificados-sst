// GET /api/lookup?document=1045737800
//   (backward compat also accepts ?cc=)
// Public verification endpoint — returns attendee + their certificates.

import { sql, json, error } from './_db.js';

export default async function handler(req, res) {
  const documentId = String(req.query.document || req.query.cc || '').trim();
  if (!/^\d{4,15}$/.test(documentId)) {
    return error(res, 'Invalid document number', 400);
  }

  try {
    const [attendee] = await sql`
      SELECT document_id, document_type, name, role, company
      FROM attendees
      WHERE document_id = ${documentId} AND active = TRUE
      LIMIT 1
    `;

    if (!attendee) {
      return json(res, { found: false });
    }

    const certificates = await sql`
      SELECT
        c.id,
        t.name         AS title,
        t.hours        AS hours,
        c.issue_date   AS issue_date,
        c.expires_at   AS expires_at,
        c.city         AS city,
        c.pdf_url      AS pdf
      FROM certificates c
      JOIN trainings t ON t.id = c.training_id
      WHERE c.document_id = ${documentId}
      ORDER BY c.issue_date DESC
    `;

    return json(res, {
      found: true,
      attendee: {
        documentId: attendee.document_id,
        documentType: attendee.document_type,
        documentLabel: `${attendee.document_type} ${attendee.document_id}`,
        name: attendee.name,
        role: attendee.role,
        company: attendee.company,
      },
      certificates: certificates.map(c => ({
        title: c.title,
        hours: c.hours,
        issueDate: formatDate(c.issue_date),
        expiresAt: formatDate(c.expires_at),
        city: c.city,
        pdf: c.pdf,
      })),
    });
  } catch (e) {
    return error(res, `Lookup failed: ${e.message}`);
  }
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
