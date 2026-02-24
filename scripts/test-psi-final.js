import 'dotenv/config';
import { auditPageSpeed } from '../server/modules/pagespeed.js';

async function testIsolatedPSI() {
    const url = 'https://www.notion.so';
    const auditId = 'TEST-ISOLATED';

    console.log("=== STARTING MOBILE PSI ===");
    const psiM = await auditPageSpeed(url, auditId, 'mobile');
    console.log("Mobile Score:", psiM.score);
    console.log("Mobile Capture URL:", psiM.capture);

    console.log("\n=== STARTING DESKTOP PSI ===");
    const psiD = await auditPageSpeed(url, auditId, 'desktop');
    console.log("Desktop Score:", psiD.score);
    console.log("Desktop Capture URL:", psiD.capture);
}
testIsolatedPSI();
