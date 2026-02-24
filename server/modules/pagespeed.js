import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { analyzeImage } from '../utils/openai.js';
import sharp from 'sharp';
import { uploadToCloudinary } from '../utils/cloudinary.js';

export async function auditPageSpeedMobile(url, auditId) {
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=mobile`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let result = {
        statut: 'FAILED',
        capture: null,
        score: null,
        details: null
    };

    try {
        console.log(`[MODULE-PSI] Starting MOBILE audit for ${url}...`);
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        console.log(`[MODULE-PSI] Waiting for analysis results (mobile)...`);
        try {
            await page.waitForSelector('.lh-gauge__percentage', { timeout: 90000 });
        } catch (e) {
            console.log(`[MODULE-PSI] Timeout waiting for gauge.`);
        }

        await page.waitForTimeout(5000);

        let domScore = null;
        try {
            const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance`;
            const apiRes = await fetch(apiUrl);
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                const apiScore = apiData?.lighthouseResult?.categories?.performance?.score;
                if (apiScore !== undefined && apiScore !== null) {
                    domScore = Math.round(apiScore * 100);
                    console.log(`[MODULE-PSI] API Score extracted (mobile): ${domScore}`);
                }
            }
        } catch (e) {
            console.log(`[MODULE-PSI] API score extraction failed: ${e.message}`);
        }

        if (domScore === null) {
            const scores = await page.evaluate(() => {
                const data = {};
                document.querySelectorAll('.lh-gauge').forEach(gauge => {
                    const label = gauge.querySelector('.lh-gauge__label')?.innerText?.toLowerCase();
                    const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                    if (label && scoreText) {
                        const scoreNum = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                        data[label] = isNaN(scoreNum) ? null : scoreNum;
                    }
                });
                if (!data['performance'] && !data['performances']) {
                    const perfGauge = document.querySelector('.lh-gauge--performance .lh-gauge__percentage');
                    if (perfGauge) {
                        data['performance'] = parseInt(perfGauge.innerText.replace(/[^0-9]/g, ''), 10);
                    }
                }
                return data;
            });
            domScore = scores['performance'] ?? scores['performances'] ?? null;
            console.log(`[MODULE-PSI] DOM Score extracted (mobile): ${domScore}`);
        }

        result.score = domScore;

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
        } catch (e) { }

        const fullPath = path.resolve(`temp_psi_full_mobile.png`);
        const perfSection = page.locator('.lh-category >> visible=true').first();
        await perfSection.waitFor({ state: 'visible', timeout: 60000 });
        await perfSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        await perfSection.screenshot({ path: fullPath });

        const metadata = await sharp(fullPath).metadata();
        let { width: w, height: h } = metadata;
        const croppedPath = path.resolve(`temp_psi_crop_mobile_${uuidv4()}.png`);

        h = Math.floor(h * 0.50);
        const T = Math.floor(h * 0.10);
        const R = Math.floor(w * 0.10);
        const B = Math.floor(h * 0.58);
        const cropH = h - B - T;
        const cropW = w - R;
        await sharp(fullPath)
            .extract({ left: 0, top: T, width: cropW, height: cropH })
            .toFile(croppedPath);

        const cloudRes = await uploadToCloudinary(croppedPath, `audit-results/psi-mobile-${auditId}`);
        result.capture = cloudRes;
        result.statut = 'SUCCESS';

        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);

    } catch (e) {
        console.error(`[MODULE-PSI] Mobile FATAL:`, e.message);
    } finally {
        await browser.close();
    }

    return result;
}

export async function auditPageSpeedDesktop(url, auditId) {
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=desktop`;

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    let result = {
        statut: 'FAILED',
        capture: null,
        score: null,
        details: null
    };

    try {
        console.log(`[MODULE-PSI] Starting DESKTOP audit for ${url}...`);
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        console.log(`[MODULE-PSI] Waiting for analysis results (desktop)...`);
        try {
            await page.waitForSelector('.lh-gauge__percentage', { timeout: 90000 });
        } catch (e) {
            console.log(`[MODULE-PSI] Timeout waiting for gauge.`);
        }

        await page.waitForTimeout(5000);

        let domScore = null;
        try {
            const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=desktop&category=performance`;
            const apiRes = await fetch(apiUrl);
            if (apiRes.ok) {
                const apiData = await apiRes.json();
                const apiScore = apiData?.lighthouseResult?.categories?.performance?.score;
                if (apiScore !== undefined && apiScore !== null) {
                    domScore = Math.round(apiScore * 100);
                    console.log(`[MODULE-PSI] API Score extracted (desktop): ${domScore}`);
                }
            }
        } catch (e) {
            console.log(`[MODULE-PSI] API score extraction failed: ${e.message}`);
        }

        if (domScore === null) {
            const scores = await page.evaluate(() => {
                const data = {};
                document.querySelectorAll('.lh-gauge').forEach(gauge => {
                    const label = gauge.querySelector('.lh-gauge__label')?.innerText?.toLowerCase();
                    const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                    if (label && scoreText) {
                        const scoreNum = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                        data[label] = isNaN(scoreNum) ? null : scoreNum;
                    }
                });
                if (!data['performance'] && !data['performances']) {
                    const perfGauge = document.querySelector('.lh-gauge--performance .lh-gauge__percentage');
                    if (perfGauge) {
                        data['performance'] = parseInt(perfGauge.innerText.replace(/[^0-9]/g, ''), 10);
                    }
                }
                return data;
            });
            domScore = scores['performance'] ?? scores['performances'] ?? null;
            console.log(`[MODULE-PSI] DOM Score extracted (desktop): ${domScore}`);
        }

        result.score = domScore;

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
        } catch (e) { }

        try {
            const desktopTab = await page.locator('button:has-text("Bureau"), button:has-text("Desktop")').first();
            await desktopTab.click();
            await page.waitForTimeout(3000);
        } catch (e) { }

        const fullPath = path.resolve(`temp_psi_full_desktop.png`);
        const perfSection = page.locator('.lh-category >> visible=true').first();
        await perfSection.waitFor({ state: 'visible', timeout: 60000 });
        await perfSection.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1000);
        await perfSection.screenshot({ path: fullPath });

        const metadata = await sharp(fullPath).metadata();
        let { width: w, height: h } = metadata;
        const croppedPath = path.resolve(`temp_psi_crop_desktop_${uuidv4()}.png`);

        h = Math.floor(h * 0.50);
        const T = Math.floor(h * 0.34);
        const L = Math.floor(w * 0.10);
        const R = Math.floor(w * 0.20);
        const B = Math.floor(h * 0.20);
        const cropW = w - L - R;
        const cropH = h - T - B;
        await sharp(fullPath)
            .extract({ left: L, top: T, width: cropW, height: cropH })
            .toFile(croppedPath);

        const cloudRes = await uploadToCloudinary(croppedPath, `audit-results/psi-desktop-${auditId}`);
        result.capture = cloudRes;
        result.statut = 'SUCCESS';

        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);

    } catch (e) {
        console.error(`[MODULE-PSI] Desktop FATAL:`, e.message);
    } finally {
        await browser.close();
    }

    return result;
}
