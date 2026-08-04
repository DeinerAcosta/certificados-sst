// GET /api/setup — Idempotent DB migration + seed.
// Runs pure-SQL DO blocks that only rename tables/columns when needed,
// so it's safe to call multiple times.

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
    // ============================================================
    // LEGACY MIGRATION (all in one DO block; server-side idempotent)
    // ============================================================
    await sql`
      DO $$
      BEGIN
        -- Table renames --
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'personas')       THEN ALTER TABLE personas       RENAME TO attendees; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'capacitaciones') THEN ALTER TABLE capacitaciones RENAME TO trainings; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'certificados')   THEN ALTER TABLE certificados   RENAME TO certificates; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'usuarios')       THEN ALTER TABLE usuarios       RENAME TO users; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'config_kv')      THEN ALTER TABLE config_kv      RENAME TO settings; END IF;

        -- attendees columns --
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendees' AND column_name='cedula')   THEN ALTER TABLE attendees RENAME COLUMN cedula   TO document_id;   END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendees' AND column_name='tipo_doc') THEN ALTER TABLE attendees RENAME COLUMN tipo_doc TO document_type; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendees' AND column_name='nombre')   THEN ALTER TABLE attendees RENAME COLUMN nombre   TO name;          END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendees' AND column_name='cargo')    THEN ALTER TABLE attendees RENAME COLUMN cargo    TO role;          END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendees' AND column_name='empresa')  THEN ALTER TABLE attendees RENAME COLUMN empresa  TO company;       END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendees' AND column_name='activo')   THEN ALTER TABLE attendees RENAME COLUMN activo   TO active;        END IF;

        -- trainings columns --
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='nombre')                THEN ALTER TABLE trainings RENAME COLUMN nombre                TO name;               END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='descripcion')           THEN ALTER TABLE trainings RENAME COLUMN descripcion           TO description;        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='horas')                 THEN ALTER TABLE trainings RENAME COLUMN horas                 TO hours;              END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='vigencia_anos')         THEN ALTER TABLE trainings RENAME COLUMN vigencia_anos         TO validity_years;     END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='empresa')               THEN ALTER TABLE trainings RENAME COLUMN empresa               TO company;            END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='categoria')             THEN ALTER TABLE trainings RENAME COLUMN categoria             TO category;           END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='activa')                THEN ALTER TABLE trainings RENAME COLUMN activa                TO active;             END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='plantilla_foca_nombre') THEN ALTER TABLE trainings RENAME COLUMN plantilla_foca_nombre TO template_foca_name; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='plantilla_foca_data')   THEN ALTER TABLE trainings RENAME COLUMN plantilla_foca_data   TO template_foca_data; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='plantilla_viu_nombre')  THEN ALTER TABLE trainings RENAME COLUMN plantilla_viu_nombre  TO template_viu_name;  END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='plantilla_viu_data')    THEN ALTER TABLE trainings RENAME COLUMN plantilla_viu_data    TO template_viu_data;  END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trainings' AND column_name='plantilla_url')         THEN ALTER TABLE trainings DROP COLUMN plantilla_url;                                 END IF;

        -- certificates columns --
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='cedula')          THEN ALTER TABLE certificates RENAME COLUMN cedula          TO document_id; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='capacitacion_id') THEN ALTER TABLE certificates RENAME COLUMN capacitacion_id TO training_id; END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='ciudad')          THEN ALTER TABLE certificates RENAME COLUMN ciudad          TO city;        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='fecha')           THEN ALTER TABLE certificates RENAME COLUMN fecha           TO issue_date;  END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='valido_hasta')    THEN ALTER TABLE certificates RENAME COLUMN valido_hasta    TO expires_at;  END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='certificates' AND column_name='emitido_por')     THEN ALTER TABLE certificates RENAME COLUMN emitido_por     TO issued_by;   END IF;

        -- users columns --
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='nombre') THEN ALTER TABLE users RENAME COLUMN nombre TO name;   END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='rol')    THEN ALTER TABLE users RENAME COLUMN rol    TO role;   END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='activo') THEN ALTER TABLE users RENAME COLUMN activo TO active; END IF;

        -- settings columns --
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='clave') THEN ALTER TABLE settings RENAME COLUMN clave TO key;   END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='settings' AND column_name='valor') THEN ALTER TABLE settings RENAME COLUMN valor TO value; END IF;
      END $$;
    `;

    // ============================================================
    // FRESH TABLES (English schema) — no-op if migration already ran
    // ============================================================
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

    // ============================================================
    // SEED
    // ============================================================
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
            VALUES (${documentId}, ${trainingId}, ${city}, ${date}, ${expiresAt}, ${'certificates/' + documentId + '.pdf'})
          `;
        }
      }
    }

    const [{ users }]        = await sql`SELECT COUNT(*)::int AS users        FROM users`;
    const [{ attendees }]    = await sql`SELECT COUNT(*)::int AS attendees    FROM attendees`;
    const [{ trainings }]    = await sql`SELECT COUNT(*)::int AS trainings    FROM trainings`;
    const [{ certificates }] = await sql`SELECT COUNT(*)::int AS certificates FROM certificates`;

    return json(res, {
      ok: true,
      message: 'Database initialized and migrated to English schema',
      totals: { users, attendees, trainings, certificates },
    });
  } catch (e) {
    return error(res, `Setup failed: ${e.message}`);
  }
}
