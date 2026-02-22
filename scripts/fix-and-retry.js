import 'dotenv/config';
import { initDb } from '../server/db.js';
import { auditQueue } from '../server/jobs/queue.js';

async function fix() {
    console.log('--- FIXING AND RETRYING NOVEK AI AUDIT ---');
    try {
        const db = await initDb();
        const audit = await db.get('SELECT id, url_site FROM audits WHERE nom_site LIKE "%novek AI%" ORDER BY created_at DESC LIMIT 1');

        if (!audit) {
            console.log('Could not find Novek AI audit.');
            return;
        }

        console.log(`Found audit: ${audit.id} | Current URL: ${audit.url_site}`);

        // Reset steps and main status
        await db.run('UPDATE audit_steps SET statut = "EN_ATTENTE", resultat = NULL, error_message = NULL, output_cloudinary_url = NULL WHERE audit_id = ?', [audit.id]);
        await db.run('UPDATE audits SET statut_global = "EN_ATTENTE" WHERE id = ?', [audit.id]);

        // Re-queue
        await auditQueue.add(`retry-${audit.id}`, {
            auditId: audit.id,
            userId: 'a4df8025-89bd-4340-9742-f83b9e4a7a8d' // Admin user id found in previous logs
        });

        console.log('Audit reset and re-queued. The worker will now apply the URL fix.');
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

fix();
