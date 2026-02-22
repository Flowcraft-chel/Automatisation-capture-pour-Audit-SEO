import 'dotenv/config';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';

async function testWorkerLogic() {
    console.log('--- ISOLATED WORKER LOGIC TEST ---');
    const siteUrl = 'https://novekai.agency';
    const auditId = 'diag-worker-' + Date.now();

    console.log('1. Testing Robots & Sitemap...');
    const robotsResult = await auditRobotsSitemap(siteUrl, auditId);
    console.log('Robots Statut:', robotsResult.robots_txt.statut);
    console.log('Robots Screenshot URL:', robotsResult.robots_txt.screenshot_url);

    console.log('\n2. Testing Logo Extraction...');
    const logoResult = await extractLogo(siteUrl, auditId);
    console.log('Logo Statut:', logoResult.statut);
    console.log('Logo URL:', logoResult.url);

    console.log('\n--- DIAGNOSTIC COMPLETE ---');
    process.exit(0);
}

testWorkerLogic().catch(err => {
    console.error('DIAGNOSTIC CRASHED:', err);
    process.exit(1);
});
