import 'dotenv/config';
import { initDb } from '../server/db.js';

async function checkId() {
    console.log('--- CHECKING AIRTABLE ID IN DB ---');
    try {
        const db = await initDb();
        const audit = await db.get('SELECT id, nom_site, airtable_record_id FROM audits WHERE nom_site LIKE "%novek AI%" ORDER BY created_at DESC LIMIT 1');

        if (audit) {
            console.log(`Audit Name: ${audit.nom_site}`);
            console.log(`Audit ID: ${audit.id}`);
            console.log(`Airtable Record ID: ${audit.airtable_record_id}`);
        } else {
            console.log('Audit not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

checkId();
