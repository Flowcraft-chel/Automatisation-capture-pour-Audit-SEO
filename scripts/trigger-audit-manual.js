import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';
import { initDb } from '../server/db.js';

async function trigger() {
    try {
        const db = await initDb();
        const latest = await db.get('SELECT id, nom_site, user_id FROM audits ORDER BY created_at DESC LIMIT 1');

        if (!latest) {
            console.log('No audits found.');
            return;
        }

        console.log(`Triggering audit for: ${latest.nom_site} (${latest.id})`);

        // Reset steps to EN_ATTENTE
        await db.run('UPDATE audit_steps SET statut = "EN_ATTENTE" WHERE audit_id = ?', [latest.id]);
        await db.run('UPDATE audits SET statut_global = "EN_ATTENTE" WHERE id = ?', [latest.id]);

        await auditQueue.add(`manual-${latest.id}`, {
            auditId: latest.id,
            userId: latest.user_id
        }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
        });

        console.log('Job added to queue.');
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

trigger();
