import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';
import { initDb } from '../server/db.js';
import { v4 as uuidv4 } from 'uuid';

async function inject() {
    console.log('--- manual job injection ---');
    try {
        const db = await initDb();
        const userId = 'a4df8025-502a-4dfc-ac45-12093e80cba3'; // From logs
        const auditId = uuidv4();

        console.log(`Creating dummy audit ${auditId}`);
        await db.run(
            'INSERT INTO audits (id, user_id, nom_site, url_site, statut_global) VALUES (?, ?, ?, ?, ?)',
            [auditId, userId, 'Test Manual', 'https://www.google.com', 'EN_COURS']
        );

        const steps = ['robots_txt', 'sitemap', 'logo'];
        for (const sk of steps) {
            await db.run(
                'INSERT INTO audit_steps (id, audit_id, step_key, statut) VALUES (?, ?, ?, ?)',
                [uuidv4(), auditId, sk, 'EN_ATTENTE']
            );
        }

        console.log('Adding job to queue...');
        const job = await auditQueue.add(`audit-${auditId}`, { auditId, userId });
        console.log(`Job added: ${job.id}`);

        // Wait a bit to see if it moves
        await new Promise(r => setTimeout(r, 2000));
        const state = await job.getState();
        console.log(`Job state after 2s: ${state}`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

inject();
