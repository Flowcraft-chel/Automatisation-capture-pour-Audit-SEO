import 'dotenv/config';
import { createAirtableAudit, updateAirtableField, updateAirtableStatut } from '../server/airtable.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function finalVerification() {
    console.log('--- FINAL END-TO-END VERIFICATION: SuperTest 2.0 ---');
    const siteUrl = 'https://novekai.agency';
    const siteName = 'SuperTest 2.0';
    const auditId = 'verif-' + Date.now();

    try {
        console.log('1. Creating Airtable Record...');
        const airtableId = await createAirtableAudit({
            siteName, siteUrl,
            auditSheetUrl: 'https://docs.google.com/test1',
            actionPlanSheetUrl: 'https://docs.google.com/test2',
            mrmReportUrl: 'https://mrm.com/test'
        });
        console.log('Created ID:', airtableId);

        console.log('\n2. Auditing Robots... (Hybrid DOM/AI Crop)');
        const robots = await auditRobotsSitemap(siteUrl, auditId);
        if (robots.robots_txt.statut === 'SUCCESS') {
            console.log(`[VERIF] Robots Capture: ${robots.robots_txt.capture}`);
            await updateAirtableField(airtableId, 'Img_Robots_Txt', robots.robots_txt.capture);
            await updateAirtableField(airtableId, 'robot', robots.robots_txt.url);
        }

        if (robots.sitemap.statut === 'SUCCESS') {
            console.log(`[VERIF] Sitemap Capture: ${robots.sitemap.capture}`);
            await updateAirtableField(airtableId, 'Img_Sitemap', robots.sitemap.capture);
            await updateAirtableField(airtableId, 'sitemaps', robots.sitemap.url);
        }

        console.log('\n3. Extracting Logo...');
        const logo = await extractLogo(siteUrl, auditId);
        if (logo.statut === 'SUCCESS') {
            console.log(`[VERIF] Logo URL: ${logo.url}`);
            await updateAirtableField(airtableId, 'Img_Logo', logo.url);
        }

        console.log('\n4. Finalizing Status...');
        await updateAirtableStatut(airtableId, 'fait');

        console.log('\n5. EXHAUSTIVE FIELD DUMP FOR VERIFICATION:');
        const record = await table.find(airtableId);
        console.log(JSON.stringify(record.fields, null, 2));

        console.log('\n--- VERIFICATION COMPLETE ---');
    } catch (e) {
        console.error('VERIFICATION FAILED:', e);
    }
    process.exit(0);
}

finalVerification();
