import 'dotenv/config';
import { initDb } from '../server/db.js';

async function check() {
    console.log('--- checking schema names ---');
    try {
        const db = await initDb();
        const tables = ['audits', 'audit_steps'];
        for (const table of tables) {
            const info = await db.all(`PRAGMA table_info(${table})`);
            console.log(`Table ${table} columns:`, info.map(c => c.name).join(', '));
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

check();
