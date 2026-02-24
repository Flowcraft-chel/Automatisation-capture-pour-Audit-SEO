import 'dotenv/config';
import { initDb } from '../server/db.js';
import { auditSslLabs } from '../server/modules/ssl_labs.js';
import { auditResponsive } from '../server/modules/responsive_check.js';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { createAirtableAudit, updateAirtableField, updateAirtableStatut } from '../server/airtable.js';
import { v4 as uuidv4 } from 'uuid';

async function verifyPremiumModules() {
    console.log('--- STARTING PREMIUM MODULES VERIFICATION ---');
    let db;
    try {
        db = await initDb();
        const user = await db.get('SELECT id FROM users LIMIT 1');
        if (!user) {
            console.error('No user found.');
            process.exit(1);
        }
        const siteUrl = 'https://www.notion.so';
        const domain = 'notion.so';
        const auditId = 'premium-verif-notion-' + Date.now();

        console.log('[VERIF] Creating Airtable record...');
        const airtableId = await createAirtableAudit({
            siteName: 'Premium Modules Verif',
            siteUrl,
            auditSheetUrl: 'https://docs.google.com/test1',
            actionPlanSheetUrl: 'https://docs.google.com/test2',
            mrmReportUrl: 'https://mrm.com/test'
        });
        console.log(`[VERIF] Airtable ID: ${airtableId}`);

        // 1. SSL Labs
        console.log('[VERIF] Running SSL Labs...');
        const sslRes = await auditSslLabs(domain, auditId);
        console.log('[VERIF] SSL Result:', sslRes.statut);
        if (sslRes.statut === 'SUCCESS' && sslRes.capture) {
            await updateAirtableField(airtableId, 'Img_SSL', sslRes.capture);
        }

        // 2. Responsive Check
        console.log('[VERIF] Running Responsive Check...');
        const respRes = await auditResponsive(siteUrl, auditId);
        console.log('[VERIF] Responsive Result:', respRes.statut);
        if (respRes.statut === 'SUCCESS' && respRes.capture) {
            await updateAirtableField(airtableId, 'Img_AmIResponsive', respRes.capture);
        }

        // 3. PageSpeed Mobile
        console.log('[VERIF] Running PSI Mobile...');
        const psiMobile = await auditPageSpeed(siteUrl, auditId, 'mobile');
        console.log('[VERIF] PSI Mobile Result:', psiMobile.statut, 'Score:', psiMobile.score);
        if (psiMobile.capture) {
            await updateAirtableField(airtableId, 'Img_PSI_Mobile', psiMobile.capture);
        }
        if (psiMobile.score) {
            await updateAirtableField(airtableId, 'pourcentage smartphone', psiMobile.score);
        }

        // 4. PageSpeed Desktop
        console.log('[VERIF] Running PSI Desktop...');
        const psiDesktop = await auditPageSpeed(siteUrl, auditId, 'desktop');
        console.log('[VERIF] PSI Desktop Result:', psiDesktop.statut, 'Score:', psiDesktop.score);
        if (psiDesktop.capture) {
            await updateAirtableField(airtableId, 'Img_PSI_Desktop', psiDesktop.capture);
        }
        if (psiDesktop.score) {
            await updateAirtableField(airtableId, 'pourcentage desktop', psiDesktop.score);
        }

        await updateAirtableStatut(airtableId, 'fait');
        console.log('--- PREMIUM VERIFICATION COMPLETE ---');

    } catch (e) {
        console.error('[VERIF ERROR]:', e);
    } finally {
        if (db) await db.close();
        process.exit(0);
    }
}

verifyPremiumModules();
