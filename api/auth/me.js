// GET /api/auth/me — { authenticated, user }

import { getUser } from '../_auth.js';

export default async function handler(req, res) {
  const user = getUser(req);
  res.status(200).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    authenticated: !!user,
    user: user ? { email: user.email, role: user.role } : null,
  }));
}
