import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { analyzeImage } from '../utils/openai.js';
import sharp from 'sharp';
import { uploadToCloudinary } from '../utils/cloudinary.js';

// ── Shared helper: get score from Google API ──────────────────────────────────
async function getScoreFromAPI(url, strategy) {
    try {
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;
        console.log(`[MODULE-PSI] Fetching API score (${strategy})...`);
        const apiRes = await fetch(apiUrl);
        if (apiRes.ok) {
            const apiData = await apiRes.json();
            const apiScore = apiData?.lighthouseResult?.categories?.performance?.score;
            if (apiScore !== undefined && apiScore !== null) {
                const score = Math.round(apiScore * 100);
                console.log(`[MODULE-PSI] API Score (${strategy}): ${score}`);
                return score;
            }
        }
    } catch (e) {
        console.log(`[MODULE-PSI] API score extraction failed (${strategy}): ${e.message}`);
    }
    return null;
}

// ── Shared helper: get score from DOM ─────────────────────────────────────────
async function getScoreFromDOM(page) {
    try {
        const scores = await page.evaluate(() => {
            const data = {};
            // Try the main gauge
            document.querySelectorAll('.lh-gauge').forEach(gauge => {
                const label = gauge.querySelector('.lh-gauge__label')?.innerText?.toLowerCase();
                const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                if (label && scoreText) {
                    const scoreNum = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                    data[label] = isNaN(scoreNum) ? null : scoreNum;
                }
            });
            // Fallback: specific performance gauge
            if (!data['performance'] && !data['performances']) {
                const perfGauge = document.querySelector('.lh-gauge--performance .lh-gauge__percentage');
                if (perfGauge) {
                    data['performance'] = parseInt(perfGauge.innerText.replace(/[^0-9]/g, ''), 10);
                }
            }
            return data;
        });
        return scores['performance'] ?? scores['performances'] ?? null;
    } catch {
        return null;
    }
}

// ── Shared helper: dismiss cookie banners ─────────────────────────────────────
async function dismissCookies(page) {
    try {
        const cookieSelectors = ['#L2AGLb', "button:has-text('Ok, Got it')", "button:has-text('Ok, j\\'accepte')", "button:has-text('Tout accepter')"];
        for (const sel of cookieSelectors) {
            const btn = await page.$(sel);
            if (btn) {
                await btn.click();
                await page.waitForTimeout(1000);
                break;
            }
        }
    } catch { }
}

// ── Core audit function (shared for both mobile and desktop) ──────────────────
async function auditPageSpeed(url, auditId, strategy) {
    const label = strategy === 'mobile' ? 'MOBILE' : 'DESKTOP';
    const formFactor = strategy === 'mobile' ? 'mobile' : 'desktop';
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=${formFactor}`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let result = { statut: 'FAILED', capture: null, score: null, details: null };

    try {
        console.log(`[MODULE-PSI] Starting ${label} audit for ${url}...`);

        // Step 1: Get score from API first (most reliable, doesn't need page to load)
        result.score = await getScoreFromAPI(url, strategy);

        // Step 2: Navigate to PSI page for the screenshot
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });
        console.log(`[MODULE-PSI] Waiting for analysis results (${label})...`);

        try {
            await page.waitForSelector('.lh-gauge__percentage', { timeout: 120000 });
            console.log(`[MODULE-PSI] Gauge appeared (${label}).`);
        } catch (e) {
            console.log(`[MODULE-PSI] Timeout waiting for gauge (${label}). Continuing with what we have...`);
        }

        await page.waitForTimeout(5000);

        // Step 3: If API score failed, try DOM
        if (result.score === null) {
            result.score = await getScoreFromDOM(page);
            if (result.score !== null) {
                console.log(`[MODULE-PSI] DOM Score extracted (${label}): ${result.score}`);
            } else {
                console.log(`[MODULE-PSI] ⚠️ No score found via API or DOM (${label}).`);
            }
        }

        // Step 4: Dismiss cookie banners
        await dismissCookies(page);

        // Step 5: Scroll to the "Analysez les problèmes de performances" / performance metrics section
        // and take screenshot of the full performance category
        await page.waitForTimeout(2000);

        // Take a full page screenshot first
        const fullPath = path.resolve(`temp_psi_full_${strategy}_${uuidv4()}.png`);

        // Try to capture the .lh-category section which contains the performance metrics
        try {
            const perfSection = page.locator('.lh-category >> visible=true').first();
            await perfSection.waitFor({ state: 'visible', timeout: 30000 });
            await perfSection.scrollIntoViewIfNeeded();
            await page.waitForTimeout(2000);
            await perfSection.screenshot({ path: fullPath });
        } catch {
            // Fallback: full viewport screenshot
            console.log(`[MODULE-PSI] Fallback to viewport screenshot (${label})`);
            await page.screenshot({ path: fullPath, fullPage: false });
        }

        // Step 6: Use AI to crop precisely — this gives the best results
        const cropPrompt = `Cette image est une capture de PageSpeed Insights (Google) en mode ${label}.
Tu dois rogner pour ne garder QUE la section "Analysez les problèmes de performances" (ou "Diagnose performance issues").
Cette section contient :
- Le grand cercle coloré avec le score de performance (le gros chiffre au centre)
- Les métriques en dessous : First Contentful Paint, Largest Contentful Paint, Total Blocking Time, Cumulative Layout Shift, Speed Index
NE PAS inclure : la barre d'URL en haut, les onglets Mobile/Desktop, la partie "Statistiques" ou "Treemap" en bas.
Rogne au millimètre.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const rawUrl = await uploadToCloudinary(fullPath, `audit-temp/psi-raw-${strategy}-${auditId}`);
        const aiRes = await analyzeImage(rawUrl, cropPrompt);
        const match = aiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

        let finalUrl;
        if (match) {
            let [, cx, cy, cw, ch] = match.map(Number);
            const meta = await sharp(fullPath).metadata();
            cx = Math.max(0, Math.min(cx, meta.width - 10));
            cy = Math.max(0, Math.min(cy, meta.height - 10));
            cw = Math.min(cw, meta.width - cx);
            ch = Math.min(ch, meta.height - cy);

            if (cw > 50 && ch > 50) {
                const croppedPath = fullPath.replace('.png', '_cropped.png');
                await sharp(fullPath).extract({ left: cx, top: cy, width: cw, height: ch }).toFile(croppedPath);
                finalUrl = await uploadToCloudinary(croppedPath, `audit-results/psi-${strategy}-${auditId}`);
                if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
            } else {
                finalUrl = rawUrl;
            }
        } else {
            // Fallback: use the raw capture
            finalUrl = rawUrl;
        }

        result.capture = finalUrl;
        result.statut = 'SUCCESS';

        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    } catch (e) {
        console.error(`[MODULE-PSI] ${label} FATAL:`, e.message);
        result.details = e.message;
    } finally {
        await browser.close();
    }

    return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────
export async function auditPageSpeedMobile(url, auditId) {
    return auditPageSpeed(url, auditId, 'mobile');
}

export async function auditPageSpeedDesktop(url, auditId) {
    return auditPageSpeed(url, auditId, 'desktop');
}
