import { chromium } from 'playwright';
import { uploadBufferToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';
import sharp from 'sharp';

/**
 * Audit robots.txt and capture evidence following "Evidence Premium v3" (Authentic Context).
 * Reverts custom font-sizes and uses "Scroll-to-Sitemap" approach.
 */
export async function auditRobotsSitemap(url, auditId) {
    console.log(`[MODULE-ROBOTS] Starting Audit for: ${url}`);
    const browser = await chromium.launch({ headless: true });
    // Use a standard viewport for natural rendering
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 }
    });
    const page = await context.newPage();

    let robotsUrl = url.endsWith('/') ? `${url}robots.txt` : `${url}/robots.txt`;
    const robotsResult = {
        robots_txt: { statut: 'EN_COURS', capture: null, url: robotsUrl },
        sitemap: { statut: 'EN_ATTENTE', url: null, capture: null }
    };

    try {
        console.log(`[MODULE-ROBOTS] Navigating to: ${robotsUrl}`);
        const response = await page.goto(robotsUrl, { waitUntil: 'networkidle', timeout: 30000 });

        if (!response || response.status() >= 400) {
            robotsResult.robots_txt.statut = 'ERROR';
            robotsResult.robots_txt.details = `Erreur HTTP: ${response ? response.status() : 'No response'}`;
        } else {
            // --- STAGE 0: Professional Styling (Inject CSS) ---
            await page.evaluate(() => {
                const style = document.createElement('style');
                style.textContent = `
                    body {
                        background-color: #0d1117 !important;
                        color: #c9d1d9 !important;
                        font-family: 'Fira Code', 'Courier New', monospace !important;
                        padding: 40px !important;
                        line-height: 1.6 !important;
                        font-size: 16px !important;
                        margin: 0 !important;
                        white-space: pre-wrap !important;
                        word-wrap: break-word !important;
                    }
                    pre { margin: 0 !important; white-space: pre-wrap !important; }
                `;
                document.head.appendChild(style);
            });
            await page.waitForTimeout(500);

            robotsResult.robots_txt.statut = 'SUCCESS';

            // --- STAGE 1: Extract Text and Locate Sitemap ---
            const sitemapInfo = await page.evaluate(() => {
                // Use textContent for "Pure" extraction, fallback to innerText
                const text = document.body.textContent || document.body.innerText || "";
                const lines = text.split('\n');

                // Search for "Sitemap:" (case-insensitive)
                const sitemapIndex = lines.findIndex(line => line.toLowerCase().includes('sitemap:'));

                if (sitemapIndex === -1) return null;

                return {
                    lineIndex: sitemapIndex,
                    text: lines[sitemapIndex].trim(),
                    totalLines: lines.length
                };
            });

            if (sitemapInfo) {
                console.log(`[MODULE-ROBOTS] Sitemap discovered at line ${sitemapInfo.lineIndex}: ${sitemapInfo.text}`);
                const sitemapMatch = sitemapInfo.text.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                if (sitemapMatch) {
                    robotsResult.sitemap.url = sitemapMatch[1];
                    robotsResult.sitemap.statut = 'SUCCESS';
                }

                // Precision Scroll: Center the sitemap line in the viewport
                await page.evaluate((index) => {
                    const estimatedLineHeight = 26; // Based on 16px font + 1.6 line-height
                    const offsetToPadding = 40;
                    const scrollTop = (index * estimatedLineHeight) + offsetToPadding - (window.innerHeight / 2.5);
                    window.scrollTo(0, Math.max(0, scrollTop));
                }, sitemapInfo.lineIndex);
                await page.waitForTimeout(800);
            } else {
                console.log('[MODULE-ROBOTS] No sitemap link found. Defaulting to top capture.');
                robotsResult.sitemap.statut = 'ERROR';
                robotsResult.sitemap.details = 'Non présent dans robots.txt';
                await page.evaluate(() => window.scrollTo(0, 0));
            }

            // --- STAGE 2: Viewport Capture ---
            const viewportBuffer = await page.screenshot({ fullPage: false });
            const rawUrl = await uploadBufferToCloudinary(viewportBuffer, `robots-v3-raw-${auditId}.png`, 'audit-temp');

            // --- STAGE 3: AI-Vision Precision Cropping ---
            // We ask the AI to "measure" and provide the best dimensions for a professional crop.
            console.log('[MODULE-ROBOTS] AI Analysis for Precision Cropping...');
            const prompt = sitemapInfo
                ? `This is a screenshot of a professional robots.txt rendering (dark mode, monospaced).
                   Task: Locate the 'Sitemap:' line and provide coordinates for a "Pixel Perfect" crop.
                   Measurement Advice: Include exactly 4 lines of context ABOVE and 4 lines BELOW the sitemap entry.
                   Centering: The sitemap line must be vertically centered in the crop.
                   Dimensions: Return ONLY the coordinates in this exact format: CROP: x=0, y=[top], width=[full_width], height=[total_height]`
                : `This is a screenshot of the top of a robots.txt file.
                   Task: Provide coordinates for a professional "Lambda" capture.
                   Measurement Advice: Capture the top block of rules (about 10-12 lines).
                   Dimensions: Return ONLY the coordinates in this exact format: CROP: x=0, y=0, width=[full_width], height=[total_height]`;

            const aiResponse = await analyzeImage(rawUrl, prompt);
            console.log(`[MODULE-ROBOTS] AI Precision Data: ${aiResponse}`);

            const cropMatch = aiResponse.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);
            if (cropMatch) {
                let [_, x, y, width, height] = cropMatch.map(Number);
                const metadata = await sharp(viewportBuffer).metadata();

                // Defensive Capping & Normalization based on AI measures
                x = Math.max(0, Math.min(x, metadata.width - 50));
                y = Math.max(0, Math.min(y, metadata.height - 50));
                width = Math.min(width, metadata.width - x);
                height = Math.min(height, metadata.height - y);

                console.log(`[MODULE-ROBOTS] Applying Perfect Crop: x=${x}, y=${y}, w=${width}, h=${height}`);

                const finalBuffer = await sharp(viewportBuffer)
                    .extract({ left: x, top: y, width: width, height: height })
                    .toBuffer();

                const finalUrl = await uploadBufferToCloudinary(finalBuffer, `robots-pixel-perfect-${auditId}.png`, 'audit-captures');
                robotsResult.robots_txt.capture = finalUrl;
                robotsResult.sitemap.capture = finalUrl; // Ensure sitemap capture is also populated for Airtable sync
            } else {
                console.warn('[MODULE-ROBOTS] AI measurements failed, fallback to raw viewport.');
                robotsResult.robots_txt.capture = rawUrl;
            }
        }
    } catch (err) {
        console.error('[MODULE-ROBOTS] Global error:', err);
        robotsResult.robots_txt.statut = 'ERROR';
    } finally {
        await browser.close();
    }

    return robotsResult;
}
