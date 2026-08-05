// GET    /api/admin/users         → list all admin users
// POST   /api/admin/users         → create new admin user
//   body: { email, name, password, role }
// DELETE /api/admin/users?id=N    → deactivate user (soft delete)

import crypto from 'crypto';
import { sql, json, error, handleError } from '../_db.js';
import { requireAuth } from '../_auth.js';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export default async function handler(req, res) {
  const currentUser = requireAuth(req, res);
  if (!currentUser) return;

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, email, name, role, active, last_login_at, created_at
        FROM users
        WHERE active = TRUE
        ORDER BY created_at DESC
      `;
      return json(res, { users: rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim();
      const password = String(body.password || '');
      const role = body.role === 'editor' ? 'editor' : 'admin';

      if (!email || !name || !password) {
        return error(res, 'Missing fields: email, name, password', 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error(res, 'Invalid email address', 400);
      }
      if (password.length < 6) {
        return error(res, 'Password must be at least 6 characters long', 400);
      }

      const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (existing.length > 0) {
        return error(res, 'A user with that email already exists', 409);
      }

      const password_hash = hashPassword(password);
      const [newUser] = await sql`
        INSERT INTO users (email, name, password_hash, role)
        VALUES (${email}, ${name}, ${password_hash}, ${role})
        RETURNING id, email, name, role, created_at
      `;
      return json(res, { ok: true, user: newUser }, 201);
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id, 10);
      if (!id) return error(res, 'Missing ?id=', 400);
      if (id === currentUser.id) {
        return error(res, 'You cannot deactivate your own user', 400);
      }
      await sql`UPDATE users SET active = FALSE WHERE id = ${id}`;
      return json(res, { ok: true });
    }

    return error(res, 'Method not allowed', 405);
  } catch (e) {
    return handleError(res, e, 'admin/users');
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
