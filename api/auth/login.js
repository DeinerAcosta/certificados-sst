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
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(derived, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison. Prevents timing attacks against the
 * ADMIN_PASSWORD env-var fallback (JS === short-circuits per character).
 */
function timingSafeStringEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still do a constant-time comparison against a same-length buffer to
    // avoid leaking length info via early return.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
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

    // Anti-bruteforce delay (defense in depth alongside the rate-limit table planned in Sprint 2)
    await new Promise(r => setTimeout(r, 300));

    if (!email || !password) return unauthorized(res, 'Email and password are required');

    // Look up user in the database — no runtime backdoors
    const rows = await sql`
      SELECT id, email, name, password_hash, role, active
      FROM users
      WHERE email = ${email}
    `;
    let user = null;
    if (rows.length && rows[0].active && verifyPassword(password, rows[0].password_hash)) {
      user = rows[0];
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
    console.error('[auth/login]', e);
    res.status(500).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'Internal server error' }));
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
