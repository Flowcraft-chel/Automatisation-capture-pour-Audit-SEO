import 'dotenv/config';
import { initDb } from '../server/db.js';

async function test() {
    console.log('--- TESTING SQL UPDATES ---');
    try {
        const db = await initDb();

        console.log('Testing update on audit_steps...');
        try {
            await db.run('UPDATE audit_steps SET updated_at = CURRENT_TIMESTAMP WHERE id = "non-existent"');
            console.log('audit_steps UPDATE: SUCCESS (or no row affected)');
        } catch (e) {
            console.error('audit_steps UPDATE: FAILED -', e.message);
        }

        console.log('Testing update on audits...');
        try {
            await db.run('UPDATE audits SET updated_at = CURRENT_TIMESTAMP WHERE id = "non-existent"');
            console.log('audits UPDATE: SUCCESS (or no row affected)');
        } catch (e) {
            console.error('audits UPDATE: FAILED -', e.message);
        }

    } catch (e) {
        console.error('Connection Error:', e.message);
    }
    process.exit(0);
}

test();
