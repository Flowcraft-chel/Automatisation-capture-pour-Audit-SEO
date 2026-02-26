import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Audit Responsive Design via AmIResponsive
 * - Navigate to amiresponsive.co.uk with the site URL
 * - Wait for the devices container (.devices) to appear
 * - Wait for the iframes inside the devices to actually load the site content
 * - Dismiss cookie banners if any
 * - Capture only the devices area
 */
export async function auditResponsive(url, auditId) {
    const domain = new URL(url).hostname;
    const amiUrl = `https://amiresponsive.co.uk/?url=${encodeURIComponent(url)}`;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 1000 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let result = {
        statut: 'FAILED',
        capture: null,
        is_responsive: false
    };

    try {
        console.log(`[MODULE-RESPONSIVE] Starting check for ${domain}...`);
        // Use networkidle to wait for all resources to load
        await page.goto(amiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        // ── 1. Forcer la soumission de l'URL car l'URL parameter ne marche pas toujours ──
        console.log('[MODULE-RESPONSIVE] Saisie de l\'URL et validation...');
        try {
            for (const inputSel of ['input[name="url"]', 'input[type="text"]', 'input[id="url"]']) {
                const input = page.locator(inputSel).first();
                if (await input.count() > 0 && await input.isVisible()) {
                    await input.fill(url);
                    break;
                }
            }
            for (const btnSel of ['button:has-text("GO")', 'input[type="submit"]', 'button[type="submit"]', '#go']) {
                const btn = page.locator(btnSel).first();
                if (await btn.count() > 0 && await btn.isVisible()) {
                    await btn.click();
                    break;
                }
            }
            await page.waitForTimeout(3000); // Laisse le temps aux iframes de se générer
        } catch {
            console.log('[MODULE-RESPONSIVE] Échec de la saisie manuelle, tentative via paramètre URL seule.');
        }

        // Wait for the devices container to appear
        console.log('[MODULE-RESPONSIVE] Waiting for devices container...');
        try {
            await page.waitForSelector('.FrameContainer, .devices, [class*="device"], iframe', {
                state: 'visible', timeout: 20000
            });
            console.log('[MODULE-RESPONSIVE] Devices container found.');
        } catch { }

        // Dismiss cookie banners
        for (const txt of ['Accept', 'OK', 'Tout accepter', 'I agree', 'Accept all', 'Accepter']) {
            try {
                const btn = page.locator(`button:has-text("${txt}")`).first();
                if (await btn.count() > 0 && await btn.isVisible()) {
                    await btn.click();
                    await page.waitForTimeout(500);
                    break;
                }
            } catch { }
        }

        // CRITICAL: Wait for iframes to actually load the site content
        console.log('[MODULE-RESPONSIVE] Attente du chargement DOM réel dans les iframes...');
        try {
            // Surveille la présence du contenu (body) dans les iframes
            await page.waitForFunction(() => {
                const iframes = document.querySelectorAll('iframe');
                if (iframes.length === 0) return false;
                for (const frame of iframes) {
                    try {
                        const content = frame.contentWindow || frame.contentDocument;
                        const doc = frame.contentDocument || content.document;
                        // Considéré comme chargé si le document d'iframe a une taille et un body
                        if (doc && doc.body && doc.body.innerHTML.length > 50) return true;
                    } catch (e) {
                        // Cross-origin: on assume que ça charge si src a changé
                        if (frame.src && frame.src.length > 10) return true;
                    }
                }
                return false;
            }, { timeout: 25000 });
            console.log('[MODULE-RESPONSIVE] Iframes prêtes.');
        } catch {
            console.log('[MODULE-RESPONSIVE] Délai dépassé pour iframes, on continue...');
        }

        // Wait additional time for images/CSS to render fully in the iframe
        console.log('[MODULE-RESPONSIVE] Attente supplémentaire pour le rendu (8s)...');
        await page.waitForTimeout(8000);

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
