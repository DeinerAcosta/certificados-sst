// POST /api/login  { email, password }
//   → Valida contra la tabla usuarios (por email)
//   → Fallback: si no hay usuario, prueba contra ADMIN_PASSWORD env var
//   → Setea cookie httpOnly válida por 8h

import crypto from 'crypto';
import { sql } from './_db.js';
import { signToken, setAuthCookie } from './_auth.js';

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

    // Retardo intencional (dificulta brute force + oculta si el email existe)
    await new Promise(r => setTimeout(r, 300));

    if (!password) {
      return unauth(res, 'Contraseña requerida');
    }

    let usuario = null;

    // 1. Intentar por usuario en DB (si dieron email)
    if (email) {
      const rows = await sql`
        SELECT id, email, nombre, password_hash, rol, activo
        FROM usuarios
        WHERE email = ${email}
      `;
      if (rows.length && rows[0].activo && verifyPassword(password, rows[0].password_hash)) {
        usuario = rows[0];
      }
    }

    // 2. Fallback: ADMIN_PASSWORD env var (por si la DB está vacía o el usuario no existe)
    if (!usuario && !email && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
      usuario = { id: 0, email: 'admin@foca.co', nombre: 'Administrador SST', rol: 'admin' };
    }

    if (!usuario) {
      return unauth(res, 'Credenciales incorrectas');
    }

    // Actualizar last_login si es usuario de la DB
    if (usuario.id > 0) {
      await sql`UPDATE usuarios SET last_login_at = NOW() WHERE id = ${usuario.id}`;
    }

    const token = signToken({ id: usuario.id, email: usuario.email, rol: usuario.rol });
    setAuthCookie(res, token);
    res.status(200).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      ok: true,
      usuario: { email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    }));
  } catch (e) {
    res.status(500).setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: e.message }));
  }
}

function unauth(res, msg) {
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
