// POST /api/auth/login   { email, password }
// Validates against users table; falls back to ADMIN_PASSWORD env var if email empty.

import crypto from 'crypto';
import { sql } from '../_db.js';
import { signToken, setAuthCookie } from '../_auth.js';

function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  try {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    // Anti-bruteforce delay
    await new Promise(r => setTimeout(r, 300));

    if (!password) return unauthorized(res, 'Password is required');

    let user = null;

    // 1) Try DB lookup by email
    if (email) {
      const rows = await sql`
        SELECT id, email, name, password_hash, role, active
        FROM users
        WHERE email = ${email}
      `;
      if (rows.length && rows[0].active && verifyPassword(password, rows[0].password_hash)) {
        user = rows[0];
      }
    }

    // 2) Fallback: master ADMIN_PASSWORD (empty email)
    if (!user && !email && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      user = { id: 0, email: 'admin@foca.co', name: 'System Administrator', role: 'admin' };
    }

    if (!user) return unauthorized(res, 'Invalid credentials');

    if (user.id > 0) {
      await sql`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    setAuthCookie(res, token);
    res.status(200).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      user: { email: user.email, name: user.name, role: user.role },
    }));
  } catch (e) {
    res.status(500).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: e.message }));
  }
}

function unauthorized(res, msg) {
  res.status(401).setHeader('Content-Type', 'application/json');
  return res.end(JSON.stringify({ error: msg }));
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
