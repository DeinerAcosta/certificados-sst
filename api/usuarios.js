// GET    /api/usuarios         → lista todos los usuarios admin
// POST   /api/usuarios         → crea nuevo usuario admin
//   body: { email, nombre, password, rol }
// DELETE /api/usuarios?id=N    → desactiva usuario (soft delete)

import crypto from 'crypto';
import { sql, json, error } from './_db.js';
import { requireAuth } from './_auth.js';

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
        SELECT id, email, nombre, rol, activo, last_login_at, created_at
        FROM usuarios
        WHERE activo = TRUE
        ORDER BY created_at DESC
      `;
      return json(res, { usuarios: rows });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const nombre = String(body.nombre || '').trim();
      const password = String(body.password || '');
      const rol = body.rol === 'editor' ? 'editor' : 'admin';

      if (!email || !nombre || !password) {
        return error(res, 'Faltan campos: email, nombre, password', 400);
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return error(res, 'Email inválido', 400);
      }
      if (password.length < 6) {
        return error(res, 'La contraseña debe tener al menos 6 caracteres', 400);
      }

      const existing = await sql`SELECT id FROM usuarios WHERE email = ${email}`;
      if (existing.length > 0) {
        return error(res, 'Ya existe un usuario con ese email', 409);
      }

      const password_hash = hashPassword(password);
      const [nuevo] = await sql`
        INSERT INTO usuarios (email, nombre, password_hash, rol)
        VALUES (${email}, ${nombre}, ${password_hash}, ${rol})
        RETURNING id, email, nombre, rol, created_at
      `;
      return json(res, { ok: true, usuario: nuevo }, 201);
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id, 10);
      if (!id) return error(res, 'Falta ?id=', 400);
      if (id === currentUser.id) {
        return error(res, 'No podés desactivar tu propio usuario', 400);
      }
      await sql`UPDATE usuarios SET activo = FALSE WHERE id = ${id}`;
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
