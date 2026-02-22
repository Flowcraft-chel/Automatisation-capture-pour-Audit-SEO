import 'dotenv/config';
import { initDb } from '../server/db.js';
import { auditQueue } from '../server/jobs/queue.js';

async function fixFinal() {
    console.log('--- CORRECTING AIRTABLE ID AND RETRYING ---');
    try {
        const db = await initDb();
        const correctAirtableId = 'recQjInA9XfFjlytF'; // Found via list-all-novek.js
        const audit = await db.get('SELECT id FROM audits WHERE nom_site LIKE "%novek AI%" ORDER BY created_at DESC LIMIT 1');

        if (!audit) {
            console.error('Audit "novek AI" not found in DB.');
            return;
        }

        console.log(`Mapping Audit ${audit.id} to correct Airtable ID: ${correctAirtableId}`);

        // Fix the ID
        await db.run('UPDATE audits SET airtable_record_id = ?, url_site = ? WHERE id = ?',
            [correctAirtableId, 'https://novekai.agency', audit.id]);

        // Reset steps
        await db.run('UPDATE audit_steps SET statut = "EN_ATTENTE", resultat = NULL, output_cloudinary_url = NULL WHERE audit_id = ?', [audit.id]);
        await db.run('UPDATE audits SET statut_global = "EN_ATTENTE" WHERE id = ?', [audit.id]);

        // Re-queue
        await auditQueue.add(`final-fix-${audit.id}`, {
            auditId: audit.id,
            userId: 'a4df8025-89bd-4340-9742-f83b9e4a7a8d'
        });

        console.log('RE-QUEUED SUCCESS. Monitoring worker logs now.');
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

fixFinal();
