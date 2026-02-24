import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';
import { initDb } from '../server/db.js';
import { v4 as uuidv4 } from 'uuid';

async function testGoogle() {
    console.log('--- STARTING LOCAL GOOGLE.COM AUDIT TEST ---');
    try {
        const db = await initDb();

        // 1. Get a valid user
        const user = await db.get('SELECT id FROM users LIMIT 1');
        if (!user) {
            console.error('No users found in database. Please register first.');
            process.exit(1);
        }
        const userId = user.id;
        const auditId = uuidv4();

        console.log(`[TEST] Using User ID: ${userId}`);
        console.log(`[TEST] Creating Audit ID: ${auditId}`);

        // 2. Insert Audit
        await db.run(
            'INSERT INTO audits (id, user_id, nom_site, url_site, statut_global) VALUES (?, ?, ?, ?, ?)',
            [auditId, userId, 'Google Local Test', 'https://www.google.com', 'EN_ATTENTE']
        );

        // 3. Initialize Steps
        const steps = [
            'robots_txt', 'sitemap', 'logo', 'psi_mobile', 'psi_desktop',
            'ami_responsive', 'ssl_labs', 'semrush', 'ahrefs', 'ubersuggest',
            'sheets_audit', 'sheets_plan', 'gsc', 'mrm'
        ];

        for (const stepKey of steps) {
            await db.run(
                'INSERT INTO audit_steps (id, audit_id, step_key, statut) VALUES (?, ?, ?, ?)',
                [uuidv4(), auditId, stepKey, 'EN_ATTENTE']
            );
        }

        console.log('[TEST] Audit and Steps initialized in DB.');

        // 4. Add to Queue
        const job = await auditQueue.add(`audit-${auditId}`, { auditId, userId });
        console.log(`[TEST] Job added to queue: ${job.id}`);

        console.log('--- TEST TRIGGERED ---');
        console.log('Watch the logs of your running server/worker to see the progress.');
        console.log('Check the Progression page in your browser.');

    } catch (err) {
        console.error('[TEST ERROR]:', err);
    } finally {
        // We don't exit immediately so we can see some initial logs if needed, 
        // but since the worker is separate, we can exit here.
        process.exit(0);
    }
}

testGoogle();
