import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Core PSI audit — shared for mobile & desktop.
 * 
 * Strategy:
 * 1. Navigate to PageSpeed Insights with the correct form_factor
 * 2. Wait for the gauge (score circle) to appear
 * 3. Extract the performance score from the DOM
 * 4. Hide everything BELOW the metrics section (Insights, Diagnostics, etc.)
 *    → The capture must go from "Analysez les problèmes de performances" to just BEFORE "Statistiques"
 * 5. Take a clean screenshot of just the performance overview + metrics
 * 6. Upload to Cloudinary
 */
async function auditPageSpeed(url, auditId, strategy) {
    const label = strategy.toUpperCase();
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    let result = { statut: 'FAILED', capture: null, score: null, details: null };

    try {
        console.log(`[MODULE-PSI] Starting ${label} audit for ${url}...`);
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 120000 });

        // ── 1. Wait for the gauge (score circle) to appear ──
        console.log(`[MODULE-PSI] Waiting for gauge (${label})...`);
        try {
            await page.waitForSelector('.lh-gauge__percentage', { timeout: 120000 });
            console.log(`[MODULE-PSI] Gauge appeared (${label}).`);
        } catch {
            console.log(`[MODULE-PSI] Gauge timeout (${label}). Continuing...`);
        }
        await page.waitForTimeout(5000);

        // ── 2. Extract the score from DOM — PROVEN METHOD ──
        const scores = await page.evaluate(() => {
            const data = {};
            // Method 1: all gauges (only visible)
            document.querySelectorAll('.lh-gauge').forEach(gauge => {
                if (gauge.offsetParent === null) return; // Skip hidden gauges
                const label = gauge.querySelector('.lh-gauge__label')?.innerText?.toLowerCase()?.trim();
                const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                if (label && scoreText) {
                    const n = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(n)) data[label] = n;
                }
            });
            // Method 2: specific performance gauge (first visible)
            if (!data['performance'] && !data['performances']) {
                const els = document.querySelectorAll('.lh-gauge__percentage');
                for (const el of els) {
                    if (el.offsetParent !== null) { // only visible
                        const n = parseInt(el.innerText.replace(/[^0-9]/g, ''), 10);
                        if (!isNaN(n)) { data['performance'] = n; break; }
                    }
                }
            }
            return data;
        });

        const domScore = scores['performance'] ?? scores['performances'] ?? null;
        console.log(`[MODULE-PSI] DOM scores (${label}):`, JSON.stringify(scores));

        // ── 3. If DOM failed, try Google API as fallback ──
        if (domScore !== null) {
            result.score = domScore;
            console.log(`[MODULE-PSI] Score from DOM (${label}): ${domScore}`);
        } else {
            try {
                const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
                const apiRes = await fetch(apiUrl, { signal: AbortSignal.timeout(30000) });
                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    const apiScore = apiData?.lighthouseResult?.categories?.performance?.score;
                    if (apiScore != null) {
                        result.score = Math.round(apiScore * 100);
                        console.log(`[MODULE-PSI] Score from API (${label}): ${result.score}`);
                    }
                }
            } catch (e) {
                console.log(`[MODULE-PSI] API fallback failed (${label}): ${e.message}`);
            }
        }

        if (result.score === null) {
            console.warn(`[MODULE-PSI] ⚠️ No score found (${label}).`);
        }

        // ── 4. Dismiss cookie banners ──
        try {
            for (const sel of ['#L2AGLb', "button:has-text('Tout accepter')", "button:has-text('Accept all')"]) {
                const btn = await page.$(sel);
                if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
            }
        } catch { }

        // ── 5. HIDE everything below the metrics section ──
        // The capture must show: Score circle + Metrics (FCP, LCP, TBT, CLS)
        // Must NOT show: Insights, Diagnostics, Statistics, Filmstrip details, etc.
        await page.evaluate(() => {
            // Hide cookie banners
            document.querySelectorAll('.glue-cookie-notification-bar, .glue-cookie-notification-bar-wrapper').forEach(el => el.style.display = 'none');

            // Hide the insights/diagnostics/statistics sections
            // These are typically after the metrics cards in .lh-category
            const hideSelectors = [
                '.lh-audit-group',          // All audit groups (Insights, Diagnostics)
                '.lh-filmstrip',            // Filmstrip screenshots
                '.lh-metrics-container ~ *', // Everything after metrics container
                '.lh-clump',                // Clustered audit results
                '[class*="insight"]',       // Any insight sections
                '[class*="diagnostic"]',    // Any diagnostic sections  
                '[class*="filmstrip"]',     // Filmstrip
                '.lh-category > .lh-audit-group', // audit groups inside category
            ];

            for (const sel of hideSelectors) {
                document.querySelectorAll(sel).forEach(el => {
                    el.style.display = 'none';
                });
            }

            // More aggressive: find the metrics section, hide everything after it
            const metricsContainer = document.querySelector('.lh-metrics-container');
            if (metricsContainer) {
                let sibling = metricsContainer.nextElementSibling;
                while (sibling) {
                    sibling.style.display = 'none';
                    sibling = sibling.nextElementSibling;
                }
            }

            // Also hide headers/nav if present
            document.querySelectorAll('header, nav, .header-section').forEach(el => el.style.display = 'none');
        });

        await page.waitForTimeout(1000);

        // ── 6. Capture the performance section (Score + Metrics only) ──
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const fullPath = path.join(tmpDir, `temp_psi_full_${strategy}_${uuidv4()}.png`);

        try {
            // Try to screenshot just the .lh-category section (performance overview)
            const perfSection = page.locator('.lh-category >> visible=true').first();
            await perfSection.waitFor({ state: 'visible', timeout: 30000 });
            await perfSection.scrollIntoViewIfNeeded();
            await page.waitForTimeout(2000);
            await perfSection.screenshot({ path: fullPath });
        } catch {
            console.log(`[MODULE-PSI] Fallback to full viewport screenshot (${label})`);
            await page.screenshot({ path: fullPath, fullPage: false });
        }

        // ── 7. Smart crop with sharp: remove any remaining bottom padding ──
        const meta = await sharp(fullPath).metadata();
        // Since we already hid excess sections, we just need a safety crop
        // Keep at most 65% of the height (the score + metrics area)
        const maxCropH = Math.min(meta.height, Math.floor(meta.height * 0.65));
        const croppedPath = fullPath.replace('.png', '_cropped.png');

        await sharp(fullPath)
            .extract({ left: 0, top: 0, width: meta.width, height: maxCropH })
            .toFile(croppedPath);

        // ── 8. Upload cropped version ──
        const cloudRes = await uploadToCloudinary(croppedPath, `audit-results/psi-${strategy}-${auditId}`);
        result.capture = cloudRes;
        result.statut = 'SUCCESS';

        // Cleanup
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);

    } catch (e) {
        console.error(`[MODULE-PSI] ${label} FATAL:`, e.message);
        result.details = e.message;
    } finally {
        await browser.close();
    }

    return result;
}

export async function auditPageSpeedMobile(url, auditId) {
    return auditPageSpeed(url, auditId, 'mobile');
}

export async function auditPageSpeedDesktop(url, auditId) {
    return auditPageSpeed(url, auditId, 'desktop');
}
