// Sistema de autenticación admin con HMAC + cookie httpOnly.
//
// Requiere DOS variables de entorno en Vercel:
//   ADMIN_PASSWORD   — contraseña que usa el admin al hacer login
//   SESSION_SECRET   — string aleatorio largo (se usa para firmar cookies)
//
// Cómo generar SESSION_SECRET:
//   openssl rand -hex 32
//   (o en PowerShell: -join ((1..64) | ForEach {[char]((48..57)+(97..122)|Get-Random)}))

import crypto from 'crypto';

const COOKIE_NAME = 'sst_admin';
const SESSION_HOURS = 8;

function getSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error('SESSION_SECRET no está configurada (mínimo 16 chars). En Vercel: Settings → Environment Variables');
  }
  return s;
}

export function signToken(payload = {}) {
  // payload = { id, email, rol }
  const now = Date.now();
  const data = Buffer.from(JSON.stringify({ ...payload, iat: now })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('hex');
  return `${data}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;

  try {
    const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('hex');
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    const ageMs = Date.now() - payload.iat;
    if (ageMs < 0 || ageMs > SESSION_HOURS * 3600 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}`
  );
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`
  );
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const idx = c.indexOf('=');
      if (idx === -1) return [c.trim(), ''];
      return [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    })
  );
}

export function getUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  return verifyToken(cookies[COOKIE_NAME]);
}

export function isAuthenticated(req) {
  return getUser(req) !== null;
}

/**
 * Middleware helper — llamar al inicio de un handler protegido.
 * Devuelve el user si continua, false si ya respondió con 401.
 */
export function requireAuth(req, res) {
  const user = getUser(req);
  if (user) return user;
  res.status(401).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'No autenticado. Iniciá sesión.' }));
  return false;
}
