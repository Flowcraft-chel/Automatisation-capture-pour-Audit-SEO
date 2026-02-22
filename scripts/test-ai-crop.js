import 'dotenv/config';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';

async function testAiCrop() {
    console.log('--- TESTING AI-POWERED ROBOTS CROPPING ---');
    const siteUrl = 'https://google.com';
    const auditId = 'test-crop-' + Date.now();

    try {
        console.log(`Starting audit for ${siteUrl}...`);
        const results = await auditRobotsSitemap(siteUrl, auditId);

        console.log('\n--- RESULTS ---');
        console.log('Robots Status:', results.robots_txt.statut);
        console.log('Robots Capture URL:', results.robots_txt.capture);
        console.log('Sitemap URL found:', results.sitemap.url);

        if (results.robots_txt.capture) {
            console.log('\nPlease manually verify the capture URL for AI-powered precision cropping.');
        } else {
            console.error('FAILED: No capture URL generated.');
        }
    } catch (e) {
        console.error('TEST CRASHED:', e);
    }
    process.exit(0);
}

testAiCrop();
