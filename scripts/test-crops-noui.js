import 'dotenv/config';
import { auditPageSpeed } from '../server/modules/pagespeed.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';

async function testFast() {
    const domain = '1440horizons.fr';
    const url = `https://www.${domain}`;
    const auditId = 'TEST-CROPS-' + Date.now();

    try {
        console.log("\\n--- Testing PageSpeed (Mobile) ---");
        const psiRes = await auditPageSpeed(url, auditId, 'mobile');
        console.log("PSI Result URL:", psiRes.capture);

        console.log("\\n--- Testing Robots & Sitemap ---");
        const robotsRes = await auditRobotsSitemap(url, auditId);
        console.log("Robots Result URL:", robotsRes.robots_txt?.capture);
        console.log("Sitemap Result URL:", robotsRes.sitemap?.capture);

        console.log("\\nALL TESTS COMPLETE.");
    } catch (e) {
        console.error("Test failed:", e);
    }
}

testFast();
