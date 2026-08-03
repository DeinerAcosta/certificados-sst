// POST /api/login  { password }
//   → Si la contraseña coincide con ADMIN_PASSWORD, setea cookie httpOnly.
//   → Cookie válida por 8h.

import { signToken, setAuthCookie } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const body = await readBody(req);
    const password = String(body.password || '');

    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      res.status(500).setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({
        error: 'ADMIN_PASSWORD no está configurada. En Vercel: Settings → Environment Variables',
      }));
    }

    // Retardo intencional para dificultar brute force
    await new Promise(r => setTimeout(r, 300));

    if (password !== expected) {
      res.status(401).setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ error: 'Contraseña incorrecta' }));
    }

    const token = signToken();
    setAuthCookie(res, token);
    res.status(200).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.status(500).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: e.message }));
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
