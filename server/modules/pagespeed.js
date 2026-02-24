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

        // Wait exactly 2 seconds to guarantee the screenshot is fully written to disk before AI Base64 encoding
        await new Promise(resolve => setTimeout(resolve, 2000));

        // AI-Driven Precision Crop and Score Extraction
        console.log(`[MODULE-PSI] Coordinating with AI for ${strategy} recommendations crop and score...`);
        const cropPrompt = `
        TASK 1 (CROP): Locate the core performance summary section. The crop MUST start ABOVE the 4 small circular category gauges ("Performances", "Accessibilité", "Bonnes pratiques", "SEO"). It MUST include these 4 small gauges at the top, the large main "Performances" gauge below them, and the mobile/desktop screenshot thumbnail on the right side. The crop MUST END just below the "Performances" scale (the red/orange/green triangles with 0-49, 50-89, 90-100). Do NOT include the "Analysez les problèmes de performances" list section. Return CROP: x=[left], y=[top], width=[content_width], height=[total_height].
        TASK 2 (SCORE): Look at the main "Performances" gauge (the largest circle, usually green, orange, or red with a number). What is the exact number inside that main circle? Return SCORE: [number between 0 and 100].
        Return both tasks on separate lines.
        `;

        const aiResponse = await analyzeImage(fullPath, cropPrompt);

        if (aiResponse) {
            console.log(`[MODULE-PSI] RAW AI RESPONSE:`, aiResponse);

            // Parse Score
            const scoreMatch = aiResponse.match(/SCORE\):\s*(\d{1,3})/i) || aiResponse.match(/SCORE:\s*(\d{1,3})/i);
            if (scoreMatch) {
                result.score = parseInt(scoreMatch[1], 10);
                console.log(`[MODULE-PSI] AI Extracted Score: ${result.score}`);
            }

            // Parse Crop
            const cropMatch = aiResponse.match(/CROP\):[^\d]*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i) || aiResponse.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);
            if (cropMatch) {
                let [_, x, y, width, height] = cropMatch.map(Number);
                const croppedPath = path.resolve(`temp_psi_crop_${strategy}_${uuidv4()}.png`);

                const metadata = await sharp(fullPath).metadata();
                // Ensure bounds
                x = Math.max(0, x);
                y = Math.max(0, y);
                width = Math.min(width, metadata.width - x);
                height = Math.min(height, metadata.height - y);

                if (width > 0 && height > 0) {
                    await sharp(fullPath)
                        .extract({ left: x, top: y, width, height })
                        .toFile(croppedPath);

                    console.log(`[MODULE-PSI] Uploading ${strategy} capture to Cloudinary...`);
                    const cloudRes = await uploadToCloudinary(croppedPath, `audit-results/psi-${strategy}-${auditId}`);
                    result.capture = cloudRes;
                    result.statut = 'SUCCESS';

                    if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
                } else {
                    console.log(`[MODULE-PSI] AI returned invalid bounds: ${x},${y},${width},${height}`);
                    throw new Error("Invalid crop bounds");
                }
            }
        } else {
            const cloudRes = await uploadToCloudinary(fullPath, `audit-results/psi-full-${strategy}-${auditId}`);
            result.capture = cloudRes;
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
