// POST /api/auth/logout — clears the session cookie.

import { clearAuthCookie } from '../_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  clearAuthCookie(res);
  res.status(200).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
}
