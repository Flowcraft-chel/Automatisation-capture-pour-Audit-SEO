import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fix() {
    const dbPath = path.resolve(__dirname, '..', 'database.sqlite');
    console.log(`[FIX] Targeting: ${dbPath}`);

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const tables = ['audits', 'audit_steps', 'users', 'user_sessions'];
    for (const table of tables) {
        try {
            // First try adding without default if it fails with default
            await db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at DATETIME`);
            console.log(`[FIX] Added updated_at (no default) to ${table}`);
            await db.exec(`UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
        } catch (e) {
            console.log(`[FIX] ${table} skip: ${e.message}`);
        }
    }

    try { await db.exec('ALTER TABLE audit_steps ADD COLUMN resultat TEXT'); console.log('[FIX] Added resultat'); } catch (e) { }

    console.log('[FIX] Done.');
    process.exit(0);
}

fix();
