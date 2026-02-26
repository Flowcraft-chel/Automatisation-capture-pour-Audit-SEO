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
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${strategy}&category=performance`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 1200 }, // Height increased to ensure metrics are visible before hiding
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    let result = { statut: 'FAILED', capture: null, score: null, details: null };

    // ── 0. Lancer l'appel API en asynchrone dès le début pour la vitesse ──
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
    let apiScorePromise = fetch(apiUrl, { signal: AbortSignal.timeout(25000) })
        .then(res => res.json())
        .then(data => {
            const score = data?.lighthouseResult?.categories?.performance?.score;
            return score != null ? Math.round(score * 100) : null;
        })
        .catch(e => {
            console.log(`[MODULE-PSI] API fetch error (${label}): ${e.message}`);
            return null;
        });

    try {
        console.log(`[MODULE-PSI] Starting ${label} audit for ${url}...`);
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        // ── 1. Wait for the gauge (score circle) to appear ──
        console.log(`[MODULE-PSI] Waiting for gauge (${label})...`);
        try {
            // Un timeout plus court pour ne pas bloquer si le site web dev est lent
            await page.waitForSelector('.lh-gauge__percentage', { timeout: 15000 });
            console.log(`[MODULE-PSI] Gauge appeared (${label}).`);
        } catch {
            console.log(`[MODULE-PSI] Gauge timeout (${label}). Continuing to screenshot using API score fallback...`);
        }
        await page.waitForTimeout(3000); // Laisse un peu de temps à l'animation de finir

        // ── 2. Extract the score from DOM ──
        const scores = await page.evaluate(() => {
            const data = {};
            document.querySelectorAll('.lh-gauge').forEach(gauge => {
                if (gauge.offsetParent === null) return;
                const labelText = gauge.querySelector('.lh-gauge__label')?.innerText?.toLowerCase()?.trim();
                const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                if (labelText && scoreText) {
                    const n = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(n)) data[labelText] = n;
                }
            });
            return data;
        });

        const domScore = scores['performance'] ?? scores['performances'] ?? null;

        // ── 3. Resolve final score (DOM 우선, sinon API) ──
        const apiScore = await apiScorePromise;
        if (domScore !== null && domScore > 0) {
            result.score = domScore;
            console.log(`[MODULE-PSI] Score extracted from DOM (${label}): ${result.score}`);
        } else if (apiScore !== null) {
            result.score = apiScore;
            console.log(`[MODULE-PSI] Score extracted from API (${label}): ${result.score}`);
        } else {
            console.warn(`[MODULE-PSI] ⚠️ No score found (${label}).`);
        }

        // ── 4. Dismiss cookie banners ──
        try {
            for (const sel of ['#L2AGLb', "button:has-text('Tout accepter')", "button:has-text('Accept all')"]) {
                const btn = await page.$(sel);
                if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
            }
        } catch { }

        // ── 5. HIDE everything except Score + Metrics ──
        await page.evaluate(() => {
            // Hide global banners
            document.querySelectorAll('.glue-cookie-notification-bar, .glue-cookie-notification-bar-wrapper').forEach(el => el.style.display = 'none');
            document.querySelectorAll('header, nav, footer, .header-section').forEach(el => el.style.display = 'none');

            // The LH report structure:
            // .lh-category contains everything.
            // We want .lh-gauge__wrapper (score) + .lh-metrics-container (the 6 metrics)

            const metricsContainer = document.querySelector('.lh-metrics-container');
            if (metricsContainer) {
                // Hide everything that is a sibling AFTER the metrics container
                let next = metricsContainer.nextElementSibling;
                while (next) {
                    next.style.display = 'none';
                    next = next.nextElementSibling;
                }
            }

            // Also hide things BEFORE the gauge if needed, but lighthouse typically starts with categories
            // Hide Filmstrip (stretches vertically)
            document.querySelectorAll('.lh-filmstrip-container, .lh-filmstrip').forEach(el => el.style.display = 'none');

            // Hide audit clumps (Diagnostics, Passed Audits)
            document.querySelectorAll('.lh-audit-group, .lh-clump, .lh-audit').forEach(el => {
                // Only hide if it's not a metric card (sometimes class names overlap)
                if (!el.classList.contains('lh-metric')) {
                    el.style.display = 'none';
                }
            });

            // Final check: find "Statistiques" or "Diagnostics" headers and hide them + their parents
            document.querySelectorAll('.lh-audit-group__header').forEach(h => {
                const group = h.closest('.lh-audit-group');
                if (group) group.style.display = 'none';
            });
        });

        await page.waitForTimeout(2000);

        // ── 6. Capture ONLY the Performance category section ──
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const fullPath = path.join(tmpDir, `temp_psi_full_${strategy}_${uuidv4()}.png`);

        const perfSection = page.locator('.lh-category >> visible=true').first();
        await perfSection.waitFor({ state: 'visible', timeout: 30000 });
        await perfSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);

        // Take screenshot of the category element
        await perfSection.screenshot({ path: fullPath });

        // ── 7. No fixed crop needed if DOM hiding worked, but we'll trim excess bottom whitespace ──
        const meta = await sharp(fullPath).metadata();
        const croppedPath = fullPath.replace('.png', '_cropped.png');

        // We keep the full width, and maybe 90% of captured height to be safe from small overlaps
        await sharp(fullPath)
            .extract({ left: 0, top: 0, width: meta.width, height: Math.min(meta.height, 800) }) // 800px is usually plenty for score+metrics
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
