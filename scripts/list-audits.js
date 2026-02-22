import 'dotenv/config';
import { initDb } from '../server/db.js';

async function listAll() {
    console.log('--- ALL SQLITE AUDITS ---');
    try {
        const db = await initDb();
        const audits = await db.all('SELECT id, nom_site, url_site, airtable_record_id, created_at FROM audits ORDER BY created_at DESC');
        console.table(audits);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

listAll();
