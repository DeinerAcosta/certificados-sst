// GET /api/me  → { authenticated, usuario }

import { getUser } from './_auth.js';

export default async function handler(req, res) {
  const user = getUser(req);
  res.status(200).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    authenticated: !!user,
    usuario: user ? { email: user.email, rol: user.rol } : null,
  }));
}
