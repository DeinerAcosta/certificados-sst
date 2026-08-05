// GET   /api/admin/settings   → current settings (with runtime defaults)
// PATCH /api/admin/settings   → update settings (upsert into settings table)

import { sql, json, error, handleError } from '../_db.js';
import { requireAuth } from '../_auth.js';

const ALLOWED_KEYS = ['portal_url', 'qr_base_url'];

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT key, value FROM settings`;
      const kv = Object.fromEntries(rows.map(r => [r.key, r.value]));

      // Runtime defaults
      const host = req.headers.host || '';
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${proto}://${host}`;

      return json(res, {
        portal_url:   kv.portal_url   || baseUrl,
        qr_base_url:  kv.qr_base_url  || `${baseUrl}/?cc=`,
      });
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = await readBody(req);
      for (const key of ALLOWED_KEYS) {
        if (key in body) {
          const value = String(body[key] ?? '');
          await sql`
            INSERT INTO settings (key, value, updated_at)
            VALUES (${key}, ${value}, NOW())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
          `;
        }
      }
      return json(res, { ok: true });
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return handleError(res, e, 'admin/settings');
  }
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
