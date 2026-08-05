// Shared Neon client + JSON response helpers for all serverless handlers.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not configured. In Vercel: Settings → Environment Variables'
  );
}

export const sql = neon(process.env.DATABASE_URL);

// -------- JSON response helpers --------
export function json(res, data, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

/** Client-safe error. `message` is sent to the client verbatim, so DO NOT pass
 *  raw exception messages here — those leak internal detail (SQL, table names,
 *  connection strings). Use `handleError()` below for unexpected exceptions. */
export function error(res, message, status = 500) {
  return json(res, { error: message }, status);
}

/** Unified handler for unexpected server exceptions. Logs the full error
 *  server-side (Vercel logs), returns a generic message to the client. */
export function handleError(res, err, context = 'api') {
  console.error(`[${context}]`, err);
  return json(res, { error: 'Internal server error' }, 500);
}
