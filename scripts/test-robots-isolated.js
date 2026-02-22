import 'dotenv/config';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';

async function test() {
    console.log('--- ISOLATED MODULE TEST: ROBOTS/SITEMAP ---');
    try {
        const siteUrl = 'https://novekai.agency';
        const auditId = 'test-id-' + Date.now();

        const results = await auditRobotsSitemap(siteUrl, auditId);

        console.log('\n--- RESULTS ---');
        console.log(JSON.stringify(results, null, 2));
    } catch (e) {
        console.error('CRITICAL ERROR:', e);
        if (e.stack) console.error(e.stack);
    }
    process.exit(0);
}

test();
