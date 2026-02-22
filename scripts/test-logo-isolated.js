import 'dotenv/config';
import { extractLogo } from '../server/modules/logo_extraction.js';

async function test() {
    console.log('--- ISOLATED LOGO TEST ---');
    try {
        const siteUrl = 'https://novekai.agency';
        const auditId = 'test-logo-' + Date.now();
        console.log('Starting extraction for:', siteUrl);

        const results = await extractLogo(siteUrl, auditId);

        console.log('\n--- FINAL LOGO RESULTS ---');
        console.log(JSON.stringify(results, null, 2));
    } catch (e) {
        console.error('CRITICAL LOGO ERROR:', e);
    }
    process.exit(0);
}

test();
