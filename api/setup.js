// GET /api/setup — crea las tablas + inserta datos de prueba
// Corré esto UNA sola vez al configurar Neon.
// Después podés borrar este archivo o dejarlo (es idempotente).

import { sql, json, error } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return error(res, 'Method not allowed', 405);
  }

  try {
    // === TABLAS ===
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
    const [{ personas }] = await sql`SELECT COUNT(*)::int AS personas FROM personas`;
    const [{ capacitaciones }] = await sql`SELECT COUNT(*)::int AS capacitaciones FROM capacitaciones`;
    const [{ certificados }] = await sql`SELECT COUNT(*)::int AS certificados FROM certificados`;

    return json(res, {
      ok: true,
      message: 'Base de datos inicializada correctamente',
      totales: { personas, capacitaciones, certificados },
    });
  } catch (e) {
    return error(res, `Setup falló: ${e.message}`);
  }
}
