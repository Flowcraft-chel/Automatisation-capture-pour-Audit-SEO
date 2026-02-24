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
        viewport: { width: 1400, height: 1200 }
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
        // The gauge with the performance score is a good selector
        console.log(`[MODULE-PSI] Waiting for analysis results (${strategy})...`);
        try {
            await page.waitForSelector('.lh-category-header', { timeout: 60000 });
        } catch (e) {
            console.log(`[MODULE-PSI] Timeout waiting for header. Checking if content exists...`);
        }

        // Wait for scores to stabilize
        await page.waitForTimeout(5000);

        // Extract scores
        const scores = await page.evaluate(() => {
            const categories = document.querySelectorAll('.lh-category-header');
            const data = {};
            categories.forEach(cat => {
                const label = cat.querySelector('.lh-gauge__label')?.innerText;
                const scoreValue = cat.querySelector('.lh-gauge__percentage')?.innerText;
                if (label) data[label.toLowerCase()] = scoreValue;
            });
            return data;
        });

        result.score = scores.performance || 'N/A';
        result.details = JSON.stringify(scores);

        // Take Full Screenshot for AI cropping
        const fullPath = path.resolve(`temp_psi_full_${strategy}.png`);
        await page.screenshot({ path: fullPath, fullPage: true });

        // AI-Driven Precision Crop for "Opportunities" or "Recommendations"
        console.log(`[MODULE-PSI] Coordinating with AI for ${strategy} recommendations crop...`);
        const cropPrompt = `Locate the "Opportunities" or "Diagnostics" section in this PageSpeed report for ${strategy}. IMPORTANT: Focus on the top area showing the core metrics and the first few recommendations. Trim empty whitespace. Return CROP: x=[left], y=[top], width=[target_width], height=[total_height].`;

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
