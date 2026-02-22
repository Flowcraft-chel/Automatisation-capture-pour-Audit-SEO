import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { auditRobotsSitemap } from '../modules/robots_sitemap.js';
import { extractLogo } from '../modules/logo_extraction.js';
import { updateAirtableStatut, updateAirtableField } from '../airtable.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`[WORKER] Redis URL detected: ${REDIS_URL}`);

const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null
});

connection.on('error', (err) => {
    console.error('[WORKER] Redis Connection Error:', err.message);
});

connection.on('connect', () => {
    console.log('[WORKER] Redis connection established.');
});

export const initWorker = (io, db) => {
    console.log('[WORKER] Initializing worker for "audit-jobs" queue...');

    const worker = new Worker('audit-jobs', async (job) => {
        const { auditId, userId } = job.data;
        console.log(`[WORKER] [JOB ${job.id}] Starting audit ${auditId} for user ${userId}`);

        try {
            // 1. Get Audit Data
            const audit = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            if (!audit) throw new Error('Audit not found');

            let siteUrl = audit.url_site;
            if (siteUrl && !siteUrl.startsWith('http')) {
                siteUrl = `https://${siteUrl}`;
                console.log(`[WORKER] [JOB ${job.id}] Normalized URL to: ${siteUrl}`);
                // Persist the fixed URL
                await db.run('UPDATE audits SET url_site = ? WHERE id = ?', [siteUrl, auditId]);
            }

            // Helper to update step status
            const updateStep = async (stepKey, status, result = null, cloudinaryUrl = null) => {
                await db.run(
                    'UPDATE audit_steps SET statut = ?, resultat = ?, output_cloudinary_url = ?, updated_at = CURRENT_TIMESTAMP WHERE audit_id = ? AND step_key = ?',
                    [status, result ? JSON.stringify(result) : null, cloudinaryUrl, auditId, stepKey]
                );

                // Fetch the updated step to emit to client
                const updatedStep = await db.get('SELECT * FROM audit_steps WHERE audit_id = ? AND step_key = ?', [auditId, stepKey]);

                io.to(`audit:${auditId}`).emit('step:update', { auditId, step: updatedStep });
                console.log(`[WORKER] [JOB ${job.id}] Step ${stepKey}: ${status}`);
            };

            // Sequence of steps
            // STEP 1: Robots & Sitemap
            await updateStep('robots_txt', 'EN_COURS');
            const robotsResult = await auditRobotsSitemap(siteUrl, auditId);

            await updateStep('robots_txt', robotsResult.robots_txt.statut, robotsResult.robots_txt.details, robotsResult.robots_txt.capture);

            // Sync Robots to Airtable
            if (audit.airtable_record_id) {
                if (robotsResult.robots_txt.statut === 'SUCCESS') {
                    await updateAirtableField(audit.airtable_record_id, 'robot', robotsResult.robots_txt.url);
                    if (robotsResult.robots_txt.capture) {
                        await updateAirtableField(audit.airtable_record_id, 'Img_Robots_Txt', robotsResult.robots_txt.capture);
                    }
                }
            }

            await updateStep('sitemap', 'EN_COURS');
            await updateStep('sitemap', robotsResult.sitemap.statut, robotsResult.sitemap.details, robotsResult.sitemap.capture);

            // Sync Sitemap to Airtable
            if (audit.airtable_record_id) {
                if (robotsResult.sitemap.statut === 'SUCCESS') {
                    await updateAirtableField(audit.airtable_record_id, 'sitemaps', robotsResult.sitemap.url);
                    if (robotsResult.sitemap.capture) {
                        console.log(`[WORKER] SYNCING SITEMAP CAPTURE TO Img_Sitemap: ${robotsResult.sitemap.capture}`);
                        await updateAirtableField(audit.airtable_record_id, 'Img_Sitemap', robotsResult.sitemap.capture);
                    }
                } else {
                    await updateAirtableField(audit.airtable_record_id, 'sitemaps', "Le fichier sitemaps n'existe pas");
                }
            }

            // STEP 2: Logo Extraction
            await updateStep('logo', 'IA_EN_COURS');
            const logoResult = await extractLogo(siteUrl, auditId);

            await updateStep('logo', logoResult.statut, logoResult.details, logoResult.url);

            // Sync Logo to Airtable
            if (audit.airtable_record_id) {
                if (logoResult.statut === 'SUCCESS' && logoResult.url) {
                    await updateAirtableField(audit.airtable_record_id, 'Img_Logo', logoResult.url);
                }
            }

            // STEP 3: Placeholder for others (Sequential loop)
            const remainingSteps = [
                'psi_mobile', 'psi_desktop',
                'ami_responsive', 'ssl_labs', 'semrush', 'ahrefs', 'ubersuggest',
                'sheets_audit', 'sheets_plan', 'gsc', 'mrm'
            ];

            for (const stepKey of remainingSteps) {
                await updateStep(stepKey, 'EN_COURS');
                await new Promise(resolve => setTimeout(resolve, 500)); // Simulate work
                await updateStep(stepKey, 'SUCCESS', 'Bientôt disponible');
            }

            // Global Success
            await db.run('UPDATE audits SET statut_global = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['TERMINE', auditId]);

            // Sync to Airtable (Non-blocking)
            if (audit.airtable_record_id) {
                try {
                    await updateAirtableStatut(audit.airtable_record_id, 'fait');
                } catch (e) {
                    console.error('[WORKER] Failed to sync "Terminé" to Airtable:', e.message);
                }
            }

            const finalAudit = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            io.to(`audit:${auditId}`).emit('audit:update', finalAudit);

            console.log(`[WORKER] [JOB ${job.id}] Audit ${auditId} completed successfully`);

        } catch (err) {
            console.error(`[WORKER] [JOB ${job.id}] Audit ${auditId} failed:`, err);
            await db.run('UPDATE audits SET statut_global = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', ['ERREUR', auditId]);
            const finalAudit = await db.get('SELECT * FROM audits WHERE id = ?', [auditId]);
            io.to(`audit:${auditId}`).emit('audit:update', finalAudit);
        }

    }, { connection });

    worker.on('ready', () => {
        console.log('[WORKER] Worker is ready and listening for jobs.');
    });

    worker.on('active', (job) => {
        console.log(`[WORKER] Job ${job.id} active.`);
    });

    worker.on('completed', job => {
        console.log(`[WORKER] Job ${job.id} completed.`);
    });

    worker.on('failed', (job, err) => {
        console.error(`[WORKER] Job ${job.id || 'unknown'} failed: ${err.message}`);
    });

    worker.on('error', err => {
        console.error('[WORKER] Critical Worker Error:', err.message);
    });

    return worker;
};
