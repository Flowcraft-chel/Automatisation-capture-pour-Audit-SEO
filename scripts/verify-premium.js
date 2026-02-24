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
        const siteUrl = 'https://www.google.com';
        const domain = 'google.com';
        const auditId = 'premium-verif-' + Date.now();

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
        const ssl = await auditSslLabs(domain, auditId);
        console.log('[VERIF] SSL Result:', ssl.statut);
        if (ssl.capture) {
            await updateAirtableField(airtableId, 'Img_Ssl_Labs', ssl.capture);
        }

        // 2. Responsive Check
        console.log('[VERIF] Running Responsive Check...');
        const resp = await auditResponsive(siteUrl, auditId);
        console.log('[VERIF] Responsive Result:', resp.statut);
        if (resp.capture) {
            await updateAirtableField(airtableId, 'Img_Responsive', resp.capture);
        }

        // 3. PageSpeed Mobile
        console.log('[VERIF] Running PSI Mobile...');
        const psiM = await auditPageSpeed(siteUrl, auditId, 'mobile');
        console.log('[VERIF] PSI Mobile Result:', psiM.statut, 'Score:', psiM.score);
        if (psiM.capture) {
            await updateAirtableField(airtableId, 'Img_PageSpeed_Mobile', psiM.capture);
            if (psiM.score) await updateAirtableField(airtableId, 'mobilescore', psiM.score);
        }

        // 4. PageSpeed Desktop
        console.log('[VERIF] Running PSI Desktop...');
        const psiD = await auditPageSpeed(siteUrl, auditId, 'desktop');
        console.log('[VERIF] PSI Desktop Result:', psiD.statut, 'Score:', psiD.score);
        if (psiD.capture) {
            await updateAirtableField(airtableId, 'Img_PageSpeed_Desktop', psiD.capture);
            if (psiD.score) await updateAirtableField(airtableId, 'desktopscore', psiD.score);
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
