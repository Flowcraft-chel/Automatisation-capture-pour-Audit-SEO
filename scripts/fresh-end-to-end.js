import 'dotenv/config';
import { createAirtableAudit, updateAirtableField, updateAirtableStatut } from '../server/airtable.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';

async function freshTest() {
    console.log('--- FRESH END-TO-END AUDIT TEST ---');
    const siteUrl = 'https://google.com';
    const siteName = 'SuperTest 2026';
    const auditId = 'fresh-' + Date.now();

    try {
        console.log('1. Creating Airtable Record...');
        const airtableId = await createAirtableAudit({
            siteName, siteUrl,
            auditSheetUrl: 'https://docs.google.com/spreadsheets/d/test1',
            actionPlanSheetUrl: 'https://docs.google.com/spreadsheets/d/test2',
            mrmReportUrl: 'https://mrm.com/report'
        });
        console.log('Created ID:', airtableId);

        console.log('2. Auditing Robots...');
        const robots = await auditRobotsSitemap(siteUrl, auditId);
        if (robots.robots_txt.statut === 'SUCCESS') {
            await updateAirtableField(airtableId, 'Img_Robots_Txt', robots.robots_txt.capture);
            await updateAirtableField(airtableId, 'robot', robots.robots_txt.url);
        }

        console.log('3. Extracting Logo...');
        const logo = await extractLogo(siteUrl, auditId);
        if (logo.statut === 'SUCCESS') {
            await updateAirtableField(airtableId, 'Img_Logo', logo.url);
        }

        console.log('4. Finalizing Status...');
        await updateAirtableStatut(airtableId, 'fait');

        console.log('--- TEST COMPLETE. CHECK AIRTABLE FOR "SuperTest 2026" ---');
    } catch (e) {
        console.error('FRESH TEST FAILED:', e);
    }
    process.exit(0);
}

freshTest();
