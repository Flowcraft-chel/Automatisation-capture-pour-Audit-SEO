import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * 404 Checker — Scan the site for broken links (404 errors)
 * Uses the site's sitemap or crawls from homepage to find 404s.
 * Returns: capture of the 404 page + list of 404 URLs.
 */
export async function check404(siteUrl, auditId) {
    const result = { statut: 'ERROR', capture: null, lien404: null };

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        const domain = new URL(siteUrl).hostname;
        console.log(`[404] Checking for broken links on ${domain}...`);

        // Strategy: Use a free online 404 checker
        const checkerUrl = `https://www.deadlinkchecker.com/website-dead-link-checker.asp`;
        await page.goto(checkerUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);

        // Enter the URL
        const input = page.locator('input[name="url"], input[type="text"]').first();
        await input.fill(siteUrl);
        await page.waitForTimeout(500);

        // Click check button
        const btn = page.locator('input[type="submit"], button[type="submit"]').first();
        if (await btn.count() > 0) {
            await btn.click();
            console.log('[404] Submitted URL for checking...');
        }

        // Wait for results (this can take a while)
        await page.waitForTimeout(30000);

        // Take screenshot of results
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const tmpPath = path.join(tmpDir, `temp_404_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        // Try to extract 404 links from the page
        const broken = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('td, span, div').forEach(el => {
                const text = el.innerText?.trim();
                if (text && (text.includes('404') || text.includes('Not Found'))) {
                    const parent = el.closest('tr');
                    if (parent) {
                        const urlCell = parent.querySelector('a, td:first-child');
                        if (urlCell?.innerText) links.push(urlCell.innerText.trim());
                    }
                }
            });
            return [...new Set(links)].slice(0, 10);
        });

        if (broken.length > 0) {
            result.lien404 = broken.join('\n');
            console.log(`[404] Found ${broken.length} broken links`);
        } else {
            console.log('[404] No broken links found (or checker still loading)');
        }

        // Upload screenshot
        const uploaded = await uploadToCloudinary(tmpPath, `audit-results/404-${auditId}`);
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';

    } catch (e) {
        result.details = e.message;
        console.error('[404] Error:', e.message);
    } finally {
        await browser.close();
    }

    return result;
}
