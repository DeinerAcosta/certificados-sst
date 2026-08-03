// GET /api/setup — crea las tablas + inserta datos de prueba
// Corré esto UNA sola vez al configurar Neon.
// Después podés borrar este archivo o dejarlo (es idempotente).

import { sql, json, error } from './_db.js';
import crypto from 'crypto';

// Utilidad: hash de password (scrypt built-in en Node)
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    // === TABLAS ===

    // Usuarios administradores del panel
    await sql`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        rol TEXT DEFAULT 'admin' CHECK (rol IN ('admin', 'editor')),
        activo BOOLEAN DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    // Personas que asistieron a alguna capacitación (destinatarios de certificados)
    await sql`
      CREATE TABLE IF NOT EXISTS personas (
        cedula TEXT PRIMARY KEY,
        tipo_doc TEXT DEFAULT 'C.C',
        nombre TEXT NOT NULL,
        cargo TEXT,
        empresa TEXT NOT NULL CHECK (empresa IN ('FOCA','VIU')),
        activo BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS capacitaciones (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        horas TEXT NOT NULL,
        vigencia_anos INT DEFAULT 2,
        empresa TEXT DEFAULT 'AMBAS',
        categoria TEXT DEFAULT 'SST',
        plantilla_url TEXT,
        activa BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS certificados (
        id SERIAL PRIMARY KEY,
        cedula TEXT NOT NULL REFERENCES personas(cedula) ON DELETE CASCADE,
        capacitacion_id INT NOT NULL REFERENCES capacitaciones(id) ON DELETE CASCADE,
        ciudad TEXT,
        fecha DATE NOT NULL,
        valido_hasta DATE,
        pdf_url TEXT,
        emitido_por TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_cert_cedula ON certificados(cedula)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_cert_capacitacion ON certificados(capacitacion_id)`;

    // === SEED: usuario admin inicial (de ADMIN_PASSWORD env var) ===
    const adminPass = process.env.ADMIN_PASSWORD;
    if (adminPass) {
      const existing = await sql`SELECT id FROM usuarios WHERE email = 'admin@foca.co'`;
      if (existing.length === 0) {
        const hash = hashPassword(adminPass);
        await sql`
          INSERT INTO usuarios (email, nombre, password_hash, rol)
          VALUES ('admin@foca.co', 'Administrador SST', ${hash}, 'admin')
        `;
      }
    }

    // === SEED: capacitación inicial ===
    const [cap] = await sql`
      INSERT INTO capacitaciones (nombre, horas, vigencia_anos, categoria, empresa)
      VALUES ('Violencia Sexual', '4 horas', 2, 'SST', 'AMBAS')
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    // === SEED: personas de prueba ===
    await sql`
      INSERT INTO personas (cedula, tipo_doc, nombre, cargo, empresa) VALUES
        ('1045737800', 'C.C', 'ACOSTA MORELO ANDREA DEL CARMEN', 'Aprendiz', 'FOCA'),
        ('1002242858', 'C.C', 'ALVAREZ BARRIOS YINARIS', 'Auxiliar de Enfermería', 'FOCA')
      ON CONFLICT (cedula) DO NOTHING
    `;

    // === SEED: certificados de prueba (si hay capacitación) ===
    const capId = cap?.id ?? (
      await sql`SELECT id FROM capacitaciones WHERE nombre = 'Violencia Sexual' LIMIT 1`
    )[0]?.id;

    if (capId) {
      await sql`
        INSERT INTO certificados (cedula, capacitacion_id, ciudad, fecha, valido_hasta, pdf_url)
        VALUES
          ('1045737800', ${capId}, 'BARRANQUILLA', '2026-03-15', '2028-03-15', 'pdfs/1045737800.pdf'),
          ('1002242858', ${capId}, 'BARRANQUILLA', '2026-03-15', '2028-03-15', 'pdfs/1002242858.pdf')
        ON CONFLICT DO NOTHING
      `;
    }

    // Contar totales para confirmar
    const [{ usuarios }] = await sql`SELECT COUNT(*)::int AS usuarios FROM usuarios`;
    const [{ personas }] = await sql`SELECT COUNT(*)::int AS personas FROM personas`;
    const [{ capacitaciones }] = await sql`SELECT COUNT(*)::int AS capacitaciones FROM capacitaciones`;
    const [{ certificados }] = await sql`SELECT COUNT(*)::int AS certificados FROM certificados`;

    return json(res, {
      ok: true,
      message: 'Base de datos inicializada correctamente',
      totales: { usuarios, personas, capacitaciones, certificados },
    });
  } catch (e) {
    return error(res, `Setup falló: ${e.message}`);
  }
}
