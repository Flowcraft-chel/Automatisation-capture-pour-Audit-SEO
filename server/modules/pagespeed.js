import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { analyzeImage } from '../utils/openai.js';
import sharp from 'sharp';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Audit PageSpeed Insights
 * @param {string} url - URL to audit
 * @param {string} auditId - Internal audit ID
 * @param {'mobile' | 'desktop'} strategy - Strategy to use
 */
export async function auditPageSpeed(url, auditId, strategy = 'mobile') {
    const psiUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&strategy=${strategy}`;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 1200 },
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
        console.log(`[MODULE-PSI] Starting ${strategy} audit for ${url}...`);
        await page.goto(psiUrl, { waitUntil: 'networkidle', timeout: 90000 });

        // Wait for results
        console.log(`[MODULE-PSI] Waiting for analysis results (${strategy})...`);
        try {
            // Wait for any gauge to appear
            await page.waitForSelector('.lh-gauge, .lh-gauge__percentage', { timeout: 60000 });
        } catch (e) {
            console.log(`[MODULE-PSI] Timeout waiting for gauge. Checking if content exists...`);
        }

        // Wait for scores to stabilize
        await page.waitForTimeout(5000);

        // Extract scores using multiple potential selectors
        const scores = await page.evaluate(() => {
            const data = {};
            // Try Lighthouse gauges first
            const gauges = document.querySelectorAll('.lh-gauge');
            gauges.forEach(gauge => {
                const label = gauge.querySelector('.lh-gauge__label')?.innerText;
                const scoreText = gauge.querySelector('.lh-gauge__percentage')?.innerText;
                if (label && scoreText) {
                    const scoreNum = parseInt(scoreText.replace(/[^0-9]/g, ''), 10);
                    data[label.toLowerCase()] = isNaN(scoreNum) ? null : scoreNum;
                }
            });

            // Fallback for Performance if not found in categories
            if (!data.performance) {
                const perfGauge = document.querySelector('.lh-gauge--performance .lh-gauge__percentage');
                if (perfGauge) {
                    data.performance = parseInt(perfGauge.innerText.replace(/[^0-9]/g, ''), 10);
                }
            }
            return data;
        });

        result.score = scores.performance !== undefined && scores.performance !== null ? scores.performance : null;
        result.details = JSON.stringify(scores);

        // Take Full Screenshot for AI cropping
        const fullPath = path.resolve(`temp_psi_full_${strategy}.png`);
        await page.screenshot({ path: fullPath, fullPage: true });

        // AI-Driven Precision Crop for "Opportunities" or "Recommendations"
        console.log(`[MODULE-PSI] Coordinating with AI for ${strategy} recommendations crop...`);
        const cropPrompt = `Locate the section titled "Analysez les problèmes de performances" (or "Opportunities/Diagnostics"). The crop MUST start at this title and end just before the "Statistiques" title. IMPORTANT: TRUNCATE ALL EMPTY WHITE SPACE ON THE RIGHT SIDE. The width MUST be narrow, matching exactly the cards/list. Return CROP: x=[left], y=[top], width=[narrow_content_width], height=[total_height].`;

        const cropCoords = await analyzeImage(fullPath, cropPrompt);

        if (cropCoords && cropCoords.includes('CROP:')) {
            const match = cropCoords.match(/x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/);
            if (match) {
                const [_, x, y, width, height] = match.map(Number);
                const croppedPath = path.resolve(`temp_psi_crop_${strategy}_${uuidv4()}.png`);

                await sharp(fullPath)
                    .extract({ left: x, top: y, width, height })
                    .toFile(croppedPath);

                console.log(`[MODULE-PSI] Uploading ${strategy} capture to Cloudinary...`);
                const cloudRes = await uploadToCloudinary(croppedPath, `audit-results/psi-${strategy}-${auditId}`);
                result.capture = cloudRes.secure_url;
                result.statut = 'SUCCESS';

                if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
            }
        } else {
            const cloudRes = await uploadToCloudinary(fullPath, `audit-results/psi-full-${strategy}-${auditId}`);
            result.capture = cloudRes.secure_url;
            result.statut = 'SUCCESS_FULLPAGE';
        }

        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    } catch (e) {
        console.error(`[MODULE-PSI] ${strategy} FATAL:`, e.message);
        result.statut = 'FAILED';
    } finally {
        await browser.close();
    }

    return result;
}
