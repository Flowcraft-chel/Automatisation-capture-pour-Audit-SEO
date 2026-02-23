import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initDb() {
  const dbPath = process.env.INTERNAL_DB_FILENAME || path.resolve(__dirname, '..', 'database.sqlite');
  console.log(`[DB] Initializing database at: ${dbPath}`);

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS audits (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      nom_site TEXT,
      url_site TEXT,
      sheet_audit_url TEXT,
      sheet_plan_url TEXT,
      mrm_report_url TEXT,
      airtable_record_id TEXT,
      statut_global TEXT DEFAULT 'EN_ATTENTE',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_steps (
      id TEXT PRIMARY KEY,
      audit_id TEXT,
      step_key TEXT,
      statut TEXT DEFAULT 'EN_ATTENTE',
      attempts INTEGER DEFAULT 0,
      error_message TEXT,
      resultat TEXT,
      output_cloudinary_url TEXT,
      output_value TEXT,
      started_at DATETIME,
      ended_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(audit_id) REFERENCES audits(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      service TEXT,
      encrypted_cookies TEXT,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  // Migrations for existing DBs
  try { await db.exec('ALTER TABLE audits ADD COLUMN updated_at DATETIME'); } catch (e) { }
  try { await db.exec('ALTER TABLE audit_steps ADD COLUMN updated_at DATETIME'); } catch (e) { }
  try { await db.exec('ALTER TABLE audit_steps ADD COLUMN resultat TEXT'); } catch (e) { }

  return db;
}
