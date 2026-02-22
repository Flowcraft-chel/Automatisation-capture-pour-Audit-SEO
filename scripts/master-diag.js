import 'dotenv/config';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import { updateAirtableField, updateAirtableStatut } from '../server/airtable.js';
import { initDb } from '../server/db.js';

async function masterDiag() {
    console.log('--- MASTER SYNC DIAGNOSTIC ---');
    const siteUrl = 'https://novekai.agency';
    const auditId = 'master-' + Date.now();
    const airtableId = 'recQjInA9XfFjlytF'; // Correct ID for novek AI

    try {
        console.log('1. Auditing Robots...');
        const robotsResult = await auditRobotsSitemap(siteUrl, auditId);
        console.log('Robots Status:', robotsResult.robots_txt.statut);
        console.log('Robots Capture URL:', robotsResult.robots_txt.capture);

        if (robotsResult.robots_txt.statut === 'SUCCESS' && robotsResult.robots_txt.capture) {
            console.log('Syncing Robots Capture to Airtable...');
            await updateAirtableField(airtableId, 'Img_Robots_Txt', robotsResult.robots_txt.capture);
            await updateAirtableField(airtableId, 'robot', robotsResult.robots_txt.url);
        } else {
            console.error('Robots capture MISSING or FAILED');
        }

        console.log('\n2. Auditing Logo...');
        const logoResult = await extractLogo(siteUrl, auditId);
        console.log('Logo Status:', logoResult.statut);
        console.log('Logo URL:', logoResult.url);

        if (logoResult.statut === 'SUCCESS' && logoResult.url) {
            console.log('Syncing Logo to Airtable...');
            await updateAirtableField(airtableId, 'Img_Logo', logoResult.url);
        } else {
            console.error('Logo capture MISSING or FAILED');
        }

        console.log('\n3. Finalizing status...');
        await updateAirtableStatut(airtableId, 'fait');

        console.log('\n--- MASTER DIAGNOSTIC COMPLETE ---');
    } catch (e) {
        console.error('MASTER DIAGNOSTIC CRASHED:', e);
    }
    process.exit(0);
}

masterDiag();
