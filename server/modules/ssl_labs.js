import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { analyzeImage } from '../utils/openai.js';
import sharp from 'sharp';
import { uploadToCloudinary } from '../utils/cloudinary.js';

/**
 * Audit SSL Labs
 * @param {string} domain - Domain to audit (e.g. google.com)
 * @param {string} auditId - Internal audit ID
 */
export async function auditSslLabs(domain, auditId) {
    const url = `https://www.ssllabs.com/ssltest/analyze.html?d=${domain}&hideResults=on`;
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 1000 }
    });
    const page = await context.newPage();

    let result = {
        statut: 'FAILED',
        capture: null,
        grade: null
    };

    try {
        console.log(`[MODULE-SSL] Starting audit for ${domain}...`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

        // Handling polling
        let finished = false;
        let attempts = 0;
        const maxAttempts = 20; // 20 * 15s = 5 mins max

        while (!finished && attempts < maxAttempts) {
            attempts++;
            console.log(`[MODULE-SSL] Waiting for analysis... Attempt ${attempts}/${maxAttempts}`);

            // Check if multiple IPs are present
            const ipLinks = await page.$$('a[href*="analyze.html?d="][href*="&s="]');
            if (ipLinks.length > 0) {
                console.log(`[MODULE-SSL] Multiple IPs detected. Clicking the first one.`);
                await ipLinks[0].click();
                await page.waitForLoadState('networkidle');
            }

            // Look for the grade or the summary section
            const hasGrade = await page.$('.gradeValue');
            const hasSummary = await page.$('#multiTable');
            const isInProgress = await page.content().then(c => c.includes('Assessment failed') || c.includes('In progress') || c.includes('Please wait'));

            if ((hasGrade || hasSummary) && !isInProgress) {
                finished = true;
                console.log(`[MODULE-SSL] Analysis finished.`);
            } else {
                await new Promise(r => setTimeout(r, 15000));
                await page.reload({ waitUntil: 'networkidle' });
            }
        }

        if (!finished) {
            throw new Error('SSL Labs analysis timed out or failed to start.');
        }

        // Final wait for rendering
        await new Promise(r => setTimeout(r, 3000));

        // Take Full Screenshot
        const fullPath = path.resolve('temp_ssl_full.png');
        await page.screenshot({ path: fullPath, fullPage: true });

        // AI-Driven Precision Crop
        console.log('[MODULE-SSL] Coordinating with AI for precision cropping...');
        const cropPrompt = "Locate the SSL Report Summary block. It contains the Grade (e.g., A, B, C) and the bar charts for Certificate, Protocol Support, etc. IMPORTANT: Trim empty space. Return CROP: x=[left], y=[top], width=[target_width], height=[total_height].";

        const cropCoords = await analyzeImage(fullPath, cropPrompt);

        if (cropCoords && cropCoords.includes('CROP:')) {
            const match = cropCoords.match(/x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/);
            if (match) {
                const [_, x, y, width, height] = match.map(Number);
                const croppedPath = path.resolve(`temp_ssl_crop_${uuidv4()}.png`);

                await sharp(fullPath)
                    .extract({ left: x, top: y, width, height })
                    .toFile(croppedPath);

                console.log('[MODULE-SSL] Uploading to Cloudinary...');
                const cloudRes = await uploadToCloudinary(croppedPath, `audit-results/ssl-${auditId}`);
                result.capture = cloudRes.secure_url;
                result.statut = 'SUCCESS';

                // Cleanup
                if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
            }
        } else {
            // Fallback: use full page if AI fails
            console.log('[MODULE-SSL] AI Crop failed, using full page fallback.');
            const cloudRes = await uploadToCloudinary(fullPath, `audit-results/ssl-full-${auditId}`);
            result.capture = cloudRes.secure_url;
            result.statut = 'SUCCESS_FULLPAGE';
        }

        // Cleanup
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

    } catch (e) {
        console.error('[MODULE-SSL] FATAL:', e.message);
        result.statut = 'FAILED';
    } finally {
        await browser.close();
    }

    return result;
}
