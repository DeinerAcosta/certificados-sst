// GET /api/setup — Idempotent DB migration + seed
// Creates tables in English, migrates from Spanish if legacy schema exists.

import { sql, json, error } from './_db.js';
import crypto from 'crypto';

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
    // === LEGACY MIGRATION (Spanish → English) ===
    // Rename old tables if they exist
    await sql`ALTER TABLE IF EXISTS personas       RENAME TO attendees`;
    await sql`ALTER TABLE IF EXISTS capacitaciones RENAME TO trainings`;
    await sql`ALTER TABLE IF EXISTS certificados   RENAME TO certificates`;
    await sql`ALTER TABLE IF EXISTS usuarios       RENAME TO users`;
    await sql`ALTER TABLE IF EXISTS config_kv      RENAME TO settings`;

    // Rename columns (each wrapped in try since RENAME COLUMN has no IF EXISTS in PG)
    const renameCol = async (table, oldCol, newCol) => {
      try { await sql.query(`ALTER TABLE ${table} RENAME COLUMN ${oldCol} TO ${newCol}`); }
      catch { /* already renamed or doesn't exist */ }
    };

    // attendees
    await renameCol('attendees', 'cedula',   'document_id');
    await renameCol('attendees', 'tipo_doc', 'document_type');
    await renameCol('attendees', 'nombre',   'name');
    await renameCol('attendees', 'cargo',    'role');
    await renameCol('attendees', 'empresa',  'company');
    await renameCol('attendees', 'activo',   'active');

    // trainings
    await renameCol('trainings', 'nombre',                 'name');
    await renameCol('trainings', 'descripcion',            'description');
    await renameCol('trainings', 'horas',                  'hours');
    await renameCol('trainings', 'vigencia_anos',          'validity_years');
    await renameCol('trainings', 'empresa',                'company');
    await renameCol('trainings', 'categoria',              'category');
    await renameCol('trainings', 'activa',                 'active');
    await renameCol('trainings', 'plantilla_foca_nombre',  'template_foca_name');
    await renameCol('trainings', 'plantilla_foca_data',    'template_foca_data');
    await renameCol('trainings', 'plantilla_viu_nombre',   'template_viu_name');
    await renameCol('trainings', 'plantilla_viu_data',     'template_viu_data');
    // Drop obsolete column
    await sql`ALTER TABLE IF EXISTS trainings DROP COLUMN IF EXISTS plantilla_url`;

    // certificates
    await renameCol('certificates', 'cedula',          'document_id');
    await renameCol('certificates', 'capacitacion_id', 'training_id');
    await renameCol('certificates', 'ciudad',          'city');
    await renameCol('certificates', 'fecha',           'issue_date');
    await renameCol('certificates', 'valido_hasta',    'expires_at');
    await renameCol('certificates', 'emitido_por',     'issued_by');
    await renameCol('certificates', 'pdf_url',         'pdf_url');

    // users
    await renameCol('users', 'nombre',        'name');
    await renameCol('users', 'rol',           'role');
    await renameCol('users', 'activo',        'active');
    await renameCol('users', 'password_hash', 'password_hash');
    await renameCol('users', 'last_login_at', 'last_login_at');

    // settings
    await renameCol('settings', 'clave', 'key');
    await renameCol('settings', 'valor', 'value');

    // === FRESH TABLES (in English) — created only if migration didn't already create them ===
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'editor')),
        active BOOLEAN DEFAULT TRUE,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS attendees (
        document_id TEXT PRIMARY KEY,
        document_type TEXT DEFAULT 'C.C',
        name TEXT NOT NULL,
        role TEXT,
        company TEXT NOT NULL CHECK (company IN ('FOCA','VIU')),
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS trainings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        hours TEXT NOT NULL,
        validity_years INT DEFAULT 2,
        company TEXT DEFAULT 'AMBAS',
        category TEXT DEFAULT 'SST',
        template_foca_name TEXT,
        template_foca_data TEXT,
        template_viu_name TEXT,
        template_viu_data TEXT,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS certificates (
        id SERIAL PRIMARY KEY,
        document_id TEXT NOT NULL REFERENCES attendees(document_id) ON DELETE CASCADE,
        training_id INT NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
        city TEXT,
        issue_date DATE NOT NULL,
        expires_at DATE,
        pdf_url TEXT,
        issued_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_certificates_document ON certificates(document_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_certificates_training ON certificates(training_id)`;

    // === SEED: initial admin user ===
    const adminPass = process.env.ADMIN_PASSWORD;
    if (adminPass) {
      const existing = await sql`SELECT id FROM users WHERE email = 'admin@foca.co'`;
      if (existing.length === 0) {
        const hash = hashPassword(adminPass);
        await sql`
          INSERT INTO users (email, name, password_hash, role)
          VALUES ('admin@foca.co', 'System Administrator', ${hash}, 'admin')
        `;
      }
    }

    // === SEED: initial training + attendees (idempotent) ===
    let trainingId;
    const existingTraining = await sql`
      SELECT id FROM trainings WHERE name = 'Violencia Sexual' LIMIT 1
    `;
    if (existingTraining.length > 0) {
      trainingId = existingTraining[0].id;
    } else {
      const [row] = await sql`
        INSERT INTO trainings (name, hours, validity_years, category, company)
        VALUES ('Violencia Sexual', '4 horas', 2, 'SST', 'AMBAS')
        RETURNING id
      `;
      trainingId = row.id;
    }

    await sql`
      INSERT INTO attendees (document_id, document_type, name, role, company) VALUES
        ('1045737800', 'C.C', 'ACOSTA MORELO ANDREA DEL CARMEN', 'Aprendiz', 'FOCA'),
        ('1002242858', 'C.C', 'ALVAREZ BARRIOS YINARIS', 'Auxiliar de Enfermería', 'FOCA')
      ON CONFLICT (document_id) DO NOTHING
    `;

    if (trainingId) {
      const seedCerts = [
        ['1045737800', 'BARRANQUILLA', '2026-03-15', '2028-03-15'],
        ['1002242858', 'BARRANQUILLA', '2026-03-15', '2028-03-15'],
      ];
      for (const [documentId, city, date, expiresAt] of seedCerts) {
        const existing = await sql`
          SELECT id FROM certificates
          WHERE document_id = ${documentId}
            AND training_id = ${trainingId}
            AND issue_date  = ${date}
        `;
        if (existing.length === 0) {
          await sql`
            INSERT INTO certificates
              (document_id, training_id, city, issue_date, expires_at, pdf_url)
            VALUES
              (${documentId}, ${trainingId}, ${city}, ${date}, ${expiresAt}, ${'certificates/' + documentId + '.pdf'})
          `;
        }
      }
    }

    // Totals
    const [{ users }]         = await sql`SELECT COUNT(*)::int AS users FROM users`;
    const [{ attendees }]     = await sql`SELECT COUNT(*)::int AS attendees FROM attendees`;
    const [{ trainings }]     = await sql`SELECT COUNT(*)::int AS trainings FROM trainings`;
    const [{ certificates }]  = await sql`SELECT COUNT(*)::int AS certificates FROM certificates`;

    return json(res, {
      ok: true,
      message: 'Database initialized and migrated to English schema',
      totals: { users, attendees, trainings, certificates },
    });
  } catch (e) {
    return error(res, `Setup failed: ${e.message}`);
  }
}
