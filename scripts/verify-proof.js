import 'dotenv/config';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import { auditSslLabs } from '../server/modules/ssl_labs.js';
import { auditResponsive } from '../server/modules/responsive_check.js';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { createAirtableAudit, updateAirtableField, updateAirtableStatut } from '../server/airtable.js';

async function verifyFinal(domainToTest) {
    const siteUrl = `https://www.${domainToTest}`;
    const auditId = 'FINAL-PROOF-' + Date.now();

    console.log(`--- STARTING FRESH E2E PROOF FOR ${domainToTest} ---`);

    try {
        console.log('[VERIF] Creating NEW Airtable record...');
        const airtableId = await createAirtableAudit({
            siteName: `PROOF-${domainToTest.toUpperCase()}`,
            siteUrl,
            auditSheetUrl: 'https://docs.google.com/spreadsheets/d/proof',
            actionPlanSheetUrl: 'https://docs.google.com/spreadsheets/d/proof',
            mrmReportUrl: 'https://mrm.com/proof'
        });
        console.log('[VERIF] Airtable ID:', airtableId);

        // 1. Robots & Sitemap
        console.log('[VERIF] 1/5 Robots & Sitemap...');
        const robotsRes = await auditRobotsSitemap(siteUrl, auditId);
        if (robotsRes.robots_txt.url) await updateAirtableField(airtableId, 'robot', robotsRes.robots_txt.url);
        if (robotsRes.robots_txt.capture) await updateAirtableField(airtableId, 'Img_Robots_Txt', robotsRes.robots_txt.capture);

        if (robotsRes.sitemap.url) await updateAirtableField(airtableId, 'sitemaps', robotsRes.sitemap.url);
        else await updateAirtableField(airtableId, 'sitemaps', "Le fichier sitemaps n'existe pas");

        if (robotsRes.sitemap.capture) await updateAirtableField(airtableId, 'Img_Sitemap', robotsRes.sitemap.capture);

        // 2. Logo
        console.log('[VERIF] 2/5 Logo...');
        const logoRes = await extractLogo(siteUrl, auditId);
        if (logoRes.url) await updateAirtableField(airtableId, 'Img_Logo', logoRes.url);

        // 3. SSL Labs
        console.log('[VERIF] 3/5 SSL Labs (Extended Timeout)...');
        const sslRes = await auditSslLabs(domainToTest, auditId);
        if (sslRes.capture) await updateAirtableField(airtableId, 'Img_SSL', sslRes.capture);

        // 4. Responsive Check
        console.log('[VERIF] 4/5 Responsive (amiresponsive.co.uk)...');
        const respRes = await auditResponsive(siteUrl, auditId);
        if (respRes.capture) await updateAirtableField(airtableId, 'Img_AmIResponsive', respRes.capture);

        // 5. PageSpeed Mobile
        console.log('[VERIF] 5/6 PSI Mobile (AI Precise Crop & Score)...');
        const psiM = await auditPageSpeed(siteUrl, auditId, 'mobile');
        if (psiM.capture) await updateAirtableField(airtableId, 'Img_PSI_Mobile', psiM.capture);
        if (psiM.score) await updateAirtableField(airtableId, 'pourcentage smartphone', psiM.score / 100);

        // 6. PageSpeed Desktop
        console.log('[VERIF] 6/6 PSI Desktop (AI Precise Crop & Score)...');
        const psiD = await auditPageSpeed(siteUrl, auditId, 'desktop');
        if (psiD.capture) await updateAirtableField(airtableId, 'Img_PSI_Desktop', psiD.capture);
        if (psiD.score) await updateAirtableField(airtableId, 'pourcentage desktop', psiD.score / 100);

        await updateAirtableStatut(airtableId, 'fait');
        console.log(`--- PROOF COMPLETE FOR ${domainToTest} ---`);
        console.log(`Check Airtable record: ${airtableId}`);

    } catch (e) {
        console.error('[VERIF] FATAL ERROR:', e);
    }
}

// Test with google.com (Fast and fresh)
verifyFinal('notion.so');
