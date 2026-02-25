import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Audit Responsive Design via AmIResponsive
 * - Wait up to 30s for the site to actually load inside device frames
 * - Do NOT inject error banners — just capture what's visible
 */
export async function auditResponsive(url, auditId) {
    const domain = new URL(url).hostname;
    const amiUrl = `https://amiresponsive.co.uk/?url=${encodeURIComponent(url)}`;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 1000 }
    });
    const page = await context.newPage();

    let result = {
        statut: 'FAILED',
        capture: null,
        is_responsive: false
    };

    try {
        console.log(`[MODULE-RESPONSIVE] Starting check for ${domain}...`);
        await page.goto(amiUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for the devices container to appear
        console.log('[MODULE-RESPONSIVE] Waiting for devices container...');
        try {
            await page.waitForSelector('.FrameContainer, .devices, [class*="device"], iframe', {
                state: 'visible', timeout: 15000
            });
        } catch {
            console.log('[MODULE-RESPONSIVE] No device container found, waiting...');
        }

        // Wait 30 seconds for the site to load inside the device frames
        console.log('[MODULE-RESPONSIVE] Waiting 30s for site to load inside frames...');
        await page.waitForTimeout(30000);

        // Dismiss any cookie banners on amiresponsive itself
        for (const txt of ['Accept', 'OK', 'Tout accepter', 'I agree']) {
            try {
                const btn = page.locator(`button:has-text("${txt}")`).first();
                if (await btn.count() > 0 && await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(500);
                    break;
                }
            } catch { }
        }

        // Take screenshot — capture only the devices area if possible
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const screenshotPath = path.join(tmpDir, `temp_responsive_${uuidv4()}.png`);

        // Try to screenshot just the device frames area
        const devicesElement = await page.$('.FrameContainer, .devices, [class*="frame-container"]');
        if (devicesElement) {
            await devicesElement.screenshot({ path: screenshotPath });
            console.log('[MODULE-RESPONSIVE] Captured devices container');
        } else {
            // Fallback to viewport screenshot
            await page.screenshot({ path: screenshotPath, fullPage: false });
            console.log('[MODULE-RESPONSIVE] Captured full viewport (fallback)');
        }

        console.log('[MODULE-RESPONSIVE] Uploading to Cloudinary...');
        const cloudRes = await uploadToCloudinary(screenshotPath, `audit-results/responsive-${auditId}`);

        result.capture = cloudRes;
        result.statut = 'SUCCESS';
        result.is_responsive = true;

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
