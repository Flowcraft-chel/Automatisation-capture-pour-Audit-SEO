import 'dotenv/config';
import { auditSslLabs } from '../server/modules/ssl_labs.js';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';

async function testModifiedModules() {
    const domain = '1440horizons.fr';
    const url = `https://www.${domain}`;
    const auditId = 'TEST-CROPS-' + Date.now();

    console.log(`Testing modified modules on ${domain}...`);

    try {
        // Run SSL Labs
        console.log("\\n--- Testing SSL Labs ---");
        const sslRes = await auditSslLabs(domain, auditId);
        console.log("SSL Result URL:", sslRes.capture);

        // Run PageSpeed
        console.log("\\n--- Testing PageSpeed (Mobile) ---");
        const psiRes = await auditPageSpeed(url, auditId, 'mobile');
        console.log("PSI Result URL:", psiRes.capture);

        // Run Robots
        console.log("\\n--- Testing Robots & Sitemap ---");
        const robotsRes = await auditRobotsSitemap(url, auditId);
        console.log("Robots Result URL:", robotsRes.robots_txt?.capture);
        console.log("Sitemap Result URL:", robotsRes.sitemap?.capture);

        console.log("\\nALL TESTS COMPLETE. Check the URLs above!");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

testModifiedModules();
