import 'dotenv/config';
import { auditSslLabs } from '../server/modules/ssl_labs.js';
import { auditResponsive } from '../server/modules/responsive_check.js';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { updateAirtableField, createAirtableAudit } from '../server/airtable.js';

async function debugSync() {
    console.log('--- DEBUG SYNC START ---');
    const siteUrl = 'https://www.notion.so';
    const auditId = 'debug-fast-' + Date.now();

    const airtableId = await createAirtableAudit({
        siteName: 'DEBUG FAST SYNC',
        siteUrl
    });
    console.log('Created Airtable Record:', airtableId);

    // 1. Responsive
    try {
        console.log('Attempting Responsive...');
        const resp = await auditResponsive(siteUrl, auditId);
        console.log('Responsive Result Capture:', resp.capture);
        if (resp.capture) {
            console.log('Syncing Responsive to Airtable...');
            await updateAirtableField(airtableId, 'Img_AmIResponsive', resp.capture);
        }
    } catch (e) { console.error('Responsive Error:', e); }

    // 2. PageSpeed
    try {
        console.log('Attempting PageSpeed Mobile...');
        const psi = await auditPageSpeed(siteUrl, auditId, 'mobile');
        console.log('PSI Result Capture:', psi.capture);
        console.log('PSI Result Score:', psi.score);
        if (psi.capture) {
            console.log('Syncing PSI Mobile to Airtable...');
            await updateAirtableField(airtableId, 'Img_PSI_Mobile', psi.capture);
        }
        if (psi.score) {
            console.log('Syncing PSI Score to Airtable...');
            await updateAirtableField(airtableId, 'pourcentage smartphone', psi.score / 100);
        }
    } catch (e) { console.error('PSI Error:', e); }

    console.log('--- DEBUG SYNC END ---');
}

debugSync();
