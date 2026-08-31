// GET /api/certificate/:id            → render the certificate PDF inline
// GET /api/certificate/:id?download=1 → same PDF as a file attachment
//
// Public on purpose: the QR printed on every certificate points at the portal,
// and the portal links straight here. Nothing here exposes anything the portal
// does not already show for a document number the caller must already know.

import { sql, error, handleError } from '../_db.js';
import { buildCertificatePdf, certificateFilename } from '../_certificate.js';

/** Century Gothic (the templates' typeface) cannot ship in this repository, so
 *  the bundled OFL fallback is used unless a licensed TTF has been stored in
 *  settings under `cert_font_ttf` as base64. Cached for the lambda's lifetime;
 *  `null` means "checked, none set". */
let fontOverride;

async function loadFontOverride() {
  if (fontOverride !== undefined) return fontOverride;
  try {
    const [row] = await sql`SELECT value FROM settings WHERE key = 'cert_font_ttf'`;
    fontOverride = row?.value ? Buffer.from(row.value, 'base64') : null;
  } catch {
    fontOverride = null;
  }
  return fontOverride;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return error(res, 'Method not allowed', 405);
  }

  const id = parseInt(req.query.id, 10);
  if (!Number.isInteger(id) || id < 1) return error(res, 'Invalid certificate id', 400);

  try {
    const [row] = await sql`
      SELECT
        c.id, c.document_id, c.city, c.issue_date, c.expires_at,
        a.name, a.document_type, a.company,
        t.name AS training_name, t.hours
      FROM certificates c
      JOIN attendees a ON a.document_id = c.document_id
      JOIN trainings t ON t.id = c.training_id
      WHERE c.id = ${id}
    `;
    if (!row) return error(res, 'Certificate not found', 404);

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;

    const cert = {
      name: row.name,
      documentId: row.document_id,
      documentType: row.document_type,
      company: row.company,
      trainingName: row.training_name,
      hours: row.hours,
      city: row.city,
      issueDate: row.issue_date,
      expiresAt: row.expires_at,
      portalBase: `${proto}://${host}`,
      fontBytes: await loadFontOverride(),
    };

    const filename = certificateFilename(cert);
    const disposition = req.query.download ? 'attachment' : 'inline';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);
    // Regenerated deterministically from the row, so it is safe to cache, but
    // an edited attendee name has to show up: revalidate on every request.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    if (req.method === 'HEAD') return res.end();

    const pdf = await buildCertificatePdf(cert);
    return res.end(Buffer.from(pdf));
  } catch (e) {
    return handleError(res, e, 'certificate');
  }
}
