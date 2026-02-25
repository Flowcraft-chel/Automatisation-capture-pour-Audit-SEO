import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Core PSI audit — shared for mobile & desktop.
 * Strategy: scrape the score from the DOM (proven method from original code),
 * then crop the top section of the .lh-category to get the performance circle + metrics.
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
            // Method 1: all gauges
            document.querySelectorAll('.lh-gauge').forEach(gauge => {
                const label = gauge.querySelector('.lh-gauge__label')?.innerText?.toLowerCase()?.trim();
                const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                if (label && scoreText) {
                    const n = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(n)) data[label] = n;
                }
            });
            // Method 2: specific performance gauge
            if (!data['performance'] && !data['performances']) {
                const el = document.querySelector('.lh-gauge__percentage');
                if (el) {
                    const n = parseInt(el.innerText.replace(/[^0-9]/g, ''), 10);
                    if (!isNaN(n)) data['performance'] = n;
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

        // ── 5. Capture the performance section ──
        const fullPath = path.resolve(`temp_psi_full_${strategy}_${uuidv4()}.png`);
        try {
            const perfSection = page.locator('.lh-category >> visible=true').first();
            await perfSection.waitFor({ state: 'visible', timeout: 30000 });
            await perfSection.scrollIntoViewIfNeeded();
            await page.waitForTimeout(2000);
            await perfSection.screenshot({ path: fullPath });
        } catch {
            console.log(`[MODULE-PSI] Fallback to full viewport screenshot (${label})`);
            await page.screenshot({ path: fullPath, fullPage: false });
        }

        // ── 6. Crop: keep only top 55% (circle + 4 core metrics, cut filmstrip) ──
        const meta = await sharp(fullPath).metadata();
        const cropH = Math.floor(meta.height * 0.55);
        const croppedPath = fullPath.replace('.png', '_cropped.png');

        await sharp(fullPath)
            .extract({ left: 0, top: 0, width: meta.width, height: cropH })
            .toFile(croppedPath);

        // ── 7. Upload cropped version ──
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
