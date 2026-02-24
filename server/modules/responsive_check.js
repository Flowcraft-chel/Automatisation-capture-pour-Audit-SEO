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
    const encodedUrl = encodeURIComponent(url);
    const amiUrl = `https://ami.responsivedesign.is/?url=${encodedUrl}`;
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
        console.log(`[MODULE-RESPONSIVE] Starting check for ${url}...`);
        await page.goto(amiUrl, { waitUntil: 'networkidle', timeout: 60000 });

        // Wait for the preview items to load
        await page.waitForTimeout(5000);

        // Check for X-Frame-Options or connection issues inside the tool
        // AMI Responsive uses iframes. If the site blocks iframes, it won't show.
        const iframeError = await page.evaluate(() => {
            // Check if devices are empty or if there's a specific error message
            const screens = document.querySelectorAll('.screen');
            let hasContent = false;
            screens.forEach(s => {
                if (s.querySelector('iframe')) hasContent = true;
            });
            return !hasContent;
        });

        if (iframeError) {
            console.log('[MODULE-RESPONSIVE] Site blocks iframe. Injecting alert band.');
            await page.evaluate(() => {
                const band = document.createElement('div');
                band.style.backgroundColor = '#ff4d4d';
                band.style.color = 'white';
                band.style.padding = '20px';
                band.style.textAlign = 'center';
                band.style.fontSize = '24px';
                band.style.fontWeight = 'bold';
                band.style.zIndex = '9999';
                band.style.position = 'fixed';
                band.style.top = '0';
                band.style.left = '0';
                band.style.width = '100%';
                band.innerHTML = '⚠️ ATTENTION : LE SITE BLOQUE LA PRÉVISUALISATION (X-FRAME-OPTIONS) OU N\'EST PAS RESPONSIVE';
                document.body.prepend(band);
            });
        }

        // Take Screenshot of the multi-device view
        const screenshotPath = path.resolve(`temp_responsive_${uuidv4()}.png`);

        // Hide the top selector to focus on results
        await page.evaluate(() => {
            const header = document.querySelector('header');
            if (header) header.style.display = 'none';
            const urlInput = document.getElementById('url-input-container');
            if (urlInput) urlInput.style.display = 'none';
        });

        await page.screenshot({ path: screenshotPath, fullPage: false });

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
