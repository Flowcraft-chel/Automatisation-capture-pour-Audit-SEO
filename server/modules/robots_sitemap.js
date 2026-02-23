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
            robotsResult.robots_txt.statut = 'SUCCESS';

            // --- STAGE 1: Find Sitemap and Scroll ---
            const sitemapInfo = await page.evaluate(() => {
                const text = document.body.innerText;
                console.log(`[EVALUATE] Page text length: ${text.length}`);
                const lines = text.split('\n');
                console.log(`[EVALUATE] Total lines: ${lines.length}`);

                const sitemapIndex = lines.findIndex(line => line.toLowerCase().includes('sitemap:'));
                console.log(`[EVALUATE] Sitemap index found: ${sitemapIndex}`);

                if (sitemapIndex === -1) {
                    console.log('[EVALUATE] Full text snippet for debugging:', text.substring(0, 500));
                    return null;
                }

                return {
                    lineIndex: sitemapIndex,
                    text: lines[sitemapIndex].trim(),
                    totalLines: lines.length
                };
            });

            if (sitemapInfo) {
                console.log(`[MODULE-ROBOTS] Sitemap line found at index ${sitemapInfo.lineIndex}: ${sitemapInfo.text}`);
                const sitemapMatch = sitemapInfo.text.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                if (sitemapMatch) {
                    robotsResult.sitemap.url = sitemapMatch[1];
                    robotsResult.sitemap.statut = 'SUCCESS';
                }

                // Scroll to center the line
                await page.evaluate((index) => {
                    // Estimate line height for scrolling if no DOM element is found (plain text pages)
                    const lineHeight = 20;
                    const scrollTop = (index * lineHeight) - (window.innerHeight / 2);
                    window.scrollTo(0, Math.max(0, scrollTop));
                }, sitemapInfo.lineIndex);
                await page.waitForTimeout(1000);
                console.log('[MODULE-ROBOTS] Scrolled to sitemap area.');
            } else {
                console.log('[MODULE-ROBOTS] No sitemap line found, remaining at top.');
                robotsResult.sitemap.statut = 'ERROR';
                robotsResult.sitemap.details = 'Non trouvé dans robots.txt';
                await page.evaluate(() => window.scrollTo(0, 0));
            }

            // --- STAGE 2: Viewport Capture ---
            const viewportBuffer = await page.screenshot({ fullPage: false });
            const rawUrl = await uploadBufferToCloudinary(viewportBuffer, `robots-v3-raw-${auditId}.png`, 'audit-temp');

            // --- STAGE 3: AI-Vision Precision Crop ---
            console.log('[MODULE-ROBOTS] Requesting AI Precision Crop (v3)...');
            const prompt = sitemapInfo
                ? `This is a screenshot of a robots.txt file. I have scrolled to the 'Sitemap:' line. 
                   Locate the line starting with 'Sitemap:'. 
                   Provide coordinates for a crop that includes exactly 3 lines ABOVE the sitemap line, the sitemap line itself, and 3 lines BELOW it.
                   The result MUST be a professional, centered view of the sitemap and its context.
                   Return ONLY the coordinates in this format: CROP: x=0, y=[top], width=[total_width], height=[height]`
                : `This is a screenshot of the top of a robots.txt file. 
                   Provide coordinates for a crop that captures the first 8 lines of text.
                   Return ONLY the coordinates in this format: CROP: x=0, y=0, width=[total_width], height=[height]`;

            const aiResponse = await analyzeImage(rawUrl, prompt);
            console.log(`[MODULE-ROBOTS] AI Response: ${aiResponse}`);

            const cropMatch = aiResponse.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);
            if (cropMatch) {
                let [_, x, y, width, height] = cropMatch.map(Number);
                const metadata = await sharp(viewportBuffer).metadata();
                console.log(`[MODULE-ROBOTS] Image Metadata: ${metadata.width}x${metadata.height}. AI Requested: x=${x}, y=${y}, w=${width}, h=${height}`);

                // Defensive capping
                x = Math.max(0, Math.min(x, metadata.width - 10));
                y = Math.max(0, Math.min(y, metadata.height - 10));
                width = Math.min(width, metadata.width - x);
                height = Math.min(height, metadata.height - y);

                console.log(`[MODULE-ROBOTS] Applying Final Crop: x=${x}, y=${y}, w=${width}, h=${height}`);

                const finalBuffer = await sharp(viewportBuffer)
                    .extract({ left: x, top: y, width: width, height: height })
                    .toBuffer();

                const finalUrl = await uploadBufferToCloudinary(finalBuffer, `robots-premium-v3-${auditId}.png`, 'audit-captures');
                robotsResult.robots_txt.capture = finalUrl;
            } else {
                console.warn('[MODULE-ROBOTS] AI did not return valid coordinates, using full viewport.');
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
