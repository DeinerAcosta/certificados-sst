// Cliente Neon compartido entre todas las funciones serverless
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL no está configurada. En Vercel: Settings > Environment Variables'
  );
}

export const sql = neon(process.env.DATABASE_URL);

// Wrapper para respuestas JSON consistentes
export function json(res, data, status = 200) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export function error(res, message, status = 500) {
  return json(res, { error: message }, status);
}
