import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Audit Responsive Design
 * @param {string} url - URL to audit
 * @param {string} auditId - Internal audit ID
 */
export async function auditResponsive(url, auditId) {
    const domain = new URL(url).hostname;
    const amiUrl = `http://amiresponsive.co.uk/?site=${domain}`;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1600, height: 1200 }
    });
    const page = await context.newPage();

    let result = {
        statut: 'FAILED',
        capture: null,
        is_responsive: false
    };

    try {
        console.log(`[MODULE-RESPONSIVE] Starting check for ${domain}...`);
        await page.goto(amiUrl, { waitUntil: 'networkidle', timeout: 60000 });

        // Wait for devices block to be visible
        console.log('[MODULE-RESPONSIVE] Waiting for .devices block...');
        await page.waitForSelector('.devices', { state: 'visible', timeout: 30000 });

        // Patiently wait for animations and iframe loads
        await page.waitForTimeout(8000);

        // Check for X-Frame-Options or CSP blocks inside the tool
        const iframeError = await page.evaluate(() => {
            const iframes = Array.from(document.querySelectorAll('.screen iframe'));
            if (iframes.length === 0) return true;

            // Try to detect if iframes are empty or showing error
            // (Note: cross-origin check is limited, but we check presence and visibility)
            return iframes.some(f => {
                try {
                    return !f.contentDocument && !f.contentWindow;
                } catch (e) {
                    // If we can't access contentDocument due to CORS, it might be loading fine
                    return false;
                }
            });
        });

        if (iframeError) {
            console.log('[MODULE-RESPONSIVE] Site likely blocks iframe. Injecting alert band.');
            await page.evaluate(() => {
                const band = document.createElement('div');
                band.id = 'security-alert-band';
                band.style.backgroundColor = '#ff4d4d';
                band.style.color = 'white';
                band.style.padding = '20px';
                band.style.textAlign = 'center';
                band.style.fontSize = '24px';
                band.style.fontWeight = 'bold';
                band.style.zIndex = '9999';
                band.style.position = 'absolute';
                band.style.top = '0';
                band.style.left = '0';
                band.style.width = '100%';
                band.innerHTML = '⚠️ SITE BLOCKS IFRAMES / CSP';
                document.querySelector('.devices').prepend(band);
            });
        }

        // Take Screenshot of only the devices part
        const screenshotPath = path.resolve(`temp_responsive_${uuidv4()}.png`);
        const devicesElement = await page.$('.devices');

        if (devicesElement) {
            await devicesElement.screenshot({ path: screenshotPath });
        } else {
            // Fallback to full page if selector fails for some reason
            await page.screenshot({ path: screenshotPath, fullPage: false });
        }

        console.log('[MODULE-RESPONSIVE] Uploading to Cloudinary...');
        const cloudRes = await uploadToCloudinary(screenshotPath, `audit-results/responsive-${auditId}`);

        result.capture = cloudRes.secure_url;
        result.statut = 'SUCCESS';
        result.is_responsive = !iframeError;

        // Cleanup
        if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);

    } catch (e) {
        console.error('[MODULE-RESPONSIVE] FATAL:', e.message);
        result.statut = 'FAILED';
    } finally {
        await browser.close();
    }

    return result;
}
