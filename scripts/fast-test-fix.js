import 'dotenv/config';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { updateAirtableField, createAirtableAudit } from '../server/airtable.js';

async function fastTest() {
    console.log('--- FAST TEST GOOGLE START ---');
    const siteUrl = 'https://www.google.com';
    const auditId = 'google-fast-' + Date.now();

    const airtableId = await createAirtableAudit({
        siteName: 'GOOGLE FAST SYNC',
        siteUrl
    });
    console.log('Created Airtable Record:', airtableId);

    try {
        console.log('Attempting PageSpeed Mobile for Google...');
        const psi = await auditPageSpeed(siteUrl, auditId, 'mobile');
        console.log('PSI Result:', { capture: psi.capture, score: psi.score });

        if (psi.capture) {
            console.log('Syncing PSI Mobile to Airtable...');
            await updateAirtableField(airtableId, 'Img_PSI_Mobile', psi.capture);
        }
        if (psi.score) {
            console.log('Syncing Score to Airtable...');
            await updateAirtableField(airtableId, 'pourcentage smartphone', psi.score / 100);
        }
    } catch (e) {
        console.error('FATAL TEST ERROR:', e);
    }
    console.log('--- FAST TEST GOOGLE END ---');
}

fastTest();
