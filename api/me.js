// GET /api/me  → devuelve { authenticated: true|false }
// Usado por el admin panel para saber si mostrar el login o el dashboard.

import { isAuthenticated } from './_auth.js';

export default async function handler(req, res) {
  res.status(200).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ authenticated: isAuthenticated(req) }));
}
