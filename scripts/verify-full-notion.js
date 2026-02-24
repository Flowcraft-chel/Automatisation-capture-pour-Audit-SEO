import 'dotenv/config';
import { initDb } from '../server/db.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import { auditSslLabs } from '../server/modules/ssl_labs.js';
import { auditResponsive } from '../server/modules/responsive_check.js';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { createAirtableAudit, updateAirtableField, updateAirtableStatut } from '../server/airtable.js';
import { v4 as uuidv4 } from 'uuid';

async function verifyFullNotion() {
    console.log('--- STARTING FULL E2E VERIFICATION FOR NOTION.SO ---');
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
        const auditId = 'full-verif-notion-' + Date.now();

        console.log('[VERIF] Creating Airtable record...');
        const airtableId = await createAirtableAudit({
            siteName: 'FULL E2E VERIF NOTION',
            siteUrl,
            auditSheetUrl: 'https://docs.google.com/spreadsheets/d/full-verif',
            actionPlanSheetUrl: 'https://docs.google.com/spreadsheets/d/full-verif',
            mrmReportUrl: 'https://mrm.com/verif'
        });
        console.log('[VERIF] Airtable ID:', airtableId);

        // 1. Robots & Sitemap
        console.log('[VERIF] Running Robots & Sitemap...');
        const robotsRes = await auditRobotsSitemap(siteUrl, auditId);
        if (robotsRes.robots_txt.capture) await updateAirtableField(airtableId, 'Img_Robots_Txt', robotsRes.robots_txt.capture);
        if (robotsRes.robots_txt.url) await updateAirtableField(airtableId, 'robot', robotsRes.robots_txt.url);
        if (robotsRes.sitemap.capture) await updateAirtableField(airtableId, 'Img_Sitemap', robotsRes.sitemap.capture);
        if (robotsRes.sitemap.url) await updateAirtableField(airtableId, 'sitemaps', robotsRes.sitemap.url);

        // 2. Logo
        console.log('[VERIF] Running Logo Extraction...');
        const logoRes = await extractLogo(siteUrl, auditId);
        if (logoRes.url) await updateAirtableField(airtableId, 'Img_Logo', logoRes.url);

        // 3. SSL Labs
        console.log('[VERIF] Running SSL Labs...');
        const sslRes = await auditSslLabs(domain, auditId);
        if (sslRes.statut === 'SUCCESS' && sslRes.capture) {
            await updateAirtableField(airtableId, 'Img_SSL', sslRes.capture);
        }

        // 4. Responsive Check
        console.log('[VERIF] Running Responsive Check...');
        const respRes = await auditResponsive(siteUrl, auditId);
        if (respRes.statut === 'SUCCESS' && respRes.capture) {
            await updateAirtableField(airtableId, 'Img_AmIResponsive', respRes.capture);
        }

        // 5. PageSpeed Mobile
        console.log('[VERIF] Running PSI Mobile...');
        const psiM = await auditPageSpeed(siteUrl, auditId, 'mobile');
        if (psiM.capture) await updateAirtableField(airtableId, 'Img_PSI_Mobile', psiM.capture);
        if (psiM.score) {
            const mScore = psiM.score / 100;
            await updateAirtableField(airtableId, 'pourcentage smartphone', mScore);
        }

        // 6. PageSpeed Desktop
        console.log('[VERIF] Running PSI Desktop...');
        const psiD = await auditPageSpeed(siteUrl, auditId, 'desktop');
        if (psiD.capture) await updateAirtableField(airtableId, 'Img_PSI_Desktop', psiD.capture);
        if (psiD.score) {
            const dScore = psiD.score / 100;
            await updateAirtableField(airtableId, 'pourcentage desktop', dScore);
        }

        await updateAirtableStatut(airtableId, 'fait');
        console.log('--- FULL E2E VERIFICATION COMPLETE ---');

    } catch (e) {
        console.error('[VERIF] FATAL ERROR:', e);
    } finally {
        if (db) await db.close();
        process.exit(0);
    }
}

verifyFullNotion();
