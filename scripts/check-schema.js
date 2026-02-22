import 'dotenv/config';
import { initDb } from '../server/db.js';

async function check() {
    console.log('--- checking schema ---');
    try {
        const db = await initDb();
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('Tables:', tables.map(t => t.name));

        for (const table of tables) {
            console.log(`--- Schema for ${table.name} ---`);
            const info = await db.all(`PRAGMA table_info(${table.name})`);
            console.log(JSON.stringify(info, null, 2));
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

check();
