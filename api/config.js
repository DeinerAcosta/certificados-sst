// GET  /api/config → devuelve config del sistema
// PATCH /api/config → actualiza config (guarda en tabla config_kv)

import { sql, json, error } from './_db.js';
import { requireAuth } from './_auth.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS config_kv (
        clave TEXT PRIMARY KEY,
        valor TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (req.method === 'GET') {
      const rows = await sql`SELECT clave, valor FROM config_kv`;
      const kv = Object.fromEntries(rows.map(r => [r.clave, r.valor]));

      // Valores por defecto (calculados en runtime)
      const host = req.headers.host || '';
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const baseUrl = `${proto}://${host}`;

      return json(res, {
        portal_url: kv.portal_url || baseUrl,
        qr_base_url: kv.qr_base_url || `${baseUrl}/?cc=`,
        firmante_1_nombre: kv.firmante_1_nombre || '',
        firmante_1_cargo:  kv.firmante_1_cargo  || '',
        firmante_2_nombre: kv.firmante_2_nombre || '',
        firmante_2_cargo:  kv.firmante_2_cargo  || '',
      });
    }

    if (req.method === 'PATCH' || req.method === 'POST') {
      const body = await readBody(req);
      const keys = [
        'portal_url', 'qr_base_url',
        'firmante_1_nombre', 'firmante_1_cargo',
        'firmante_2_nombre', 'firmante_2_cargo',
      ];
      for (const k of keys) {
        if (k in body) {
          const v = String(body[k] ?? '');
          await sql`
            INSERT INTO config_kv (clave, valor, updated_at)
            VALUES (${k}, ${v}, NOW())
            ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = NOW()
          `;
        }
      }
      return json(res, { ok: true });
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return error(res, e.message);
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
