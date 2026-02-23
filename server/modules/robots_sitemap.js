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
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 }
    });
    const page = await context.newPage();

    let robotsUrl = url.endsWith('/') ? `${url}robots.txt` : `${url}/robots.txt`;
    const robotsResult = {
        robots_txt: { statut: 'EN_COURS', capture: null, url: robotsUrl },
        sitemap: { statut: 'EN_ATTENTE', url: null, capture: null }
    };

    const injectProfessionalCSS = async (p) => {
        await p.evaluate(() => {
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
        await p.waitForTimeout(500);
    };

    try {
        // --- STAGE 1: robots.txt ---
        console.log(`[MODULE-ROBOTS] Navigating to: ${robotsUrl}`);
        const robotsResponse = await page.goto(robotsUrl, { waitUntil: 'networkidle', timeout: 30000 });

        if (!robotsResponse || robotsResponse.status() >= 400) {
            robotsResult.robots_txt.statut = 'ERROR';
            robotsResult.robots_txt.details = `Erreur HTTP: ${robotsResponse ? robotsResponse.status() : 'No response'}`;
        } else {
            await injectProfessionalCSS(page);
            robotsResult.robots_txt.statut = 'SUCCESS';

            const sitemapInfo = await page.evaluate(() => {
                const text = document.body.textContent || document.body.innerText || "";
                const lines = text.split('\n');
                const index = lines.findIndex(l => l.toLowerCase().includes('sitemap:'));
                return index !== -1 ? { lineIndex: index, text: lines[index].trim() } : null;
            });

            if (sitemapInfo) {
                const sitemapMatch = sitemapInfo.text.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                if (sitemapMatch) {
                    robotsResult.sitemap.url = sitemapMatch[1];
                    robotsResult.sitemap.statut = 'EN_COURS';
                }
                await page.evaluate((idx) => {
                    const scrollTop = (idx * 26) + 40 - (window.innerHeight / 2.5);
                    window.scrollTo(0, Math.max(0, scrollTop));
                }, sitemapInfo.lineIndex);
                await page.waitForTimeout(500);
            }

            const robotsViewportBuffer = await page.screenshot({ fullPage: false });
            const robotsRawUrl = await uploadBufferToCloudinary(robotsViewportBuffer, `robots-raw-${auditId}.png`, 'audit-temp');

            const robotsPrompt = sitemapInfo
                ? "Locate the 'Sitemap:' line and return CROP: x=0, y=[top], width=[full_width], height=[total_height] with 4 lines context above/below."
                : "Capture the top block of rules. Return CROP: x=0, y=0, width=[full_width], height=[total_height]";

            const robotsAiRes = await analyzeImage(robotsRawUrl, robotsPrompt);
            const rMatch = robotsAiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

            if (rMatch) {
                const [_, rx, ry, rw, rh] = rMatch.map(Number);
                const robotsFinalBuffer = await sharp(robotsViewportBuffer).extract({ left: rx, top: ry, width: rw, height: rh }).toBuffer();
                robotsResult.robots_txt.capture = await uploadBufferToCloudinary(robotsFinalBuffer, `robots-final-${auditId}.png`, 'audit-captures');
            } else {
                robotsResult.robots_txt.capture = robotsRawUrl;
            }
        }

        // --- STAGE 2: Actual Sitemap Page ---
        if (robotsResult.sitemap.url) {
            console.log(`[MODULE-ROBOTS] Navigating to Actual Sitemap: ${robotsResult.sitemap.url}`);
            try {
                await page.goto(robotsResult.sitemap.url, { waitUntil: 'networkidle', timeout: 30000 });
                await injectProfessionalCSS(page);

                const sitemapViewportBuffer = await page.screenshot({ fullPage: false });
                const sitemapRawUrl = await uploadBufferToCloudinary(sitemapViewportBuffer, `sitemap-raw-${auditId}.png`, 'audit-temp');

                const sitemapPrompt = "This is a sitemap XML/HTML page. Provide coordinates for a professional crop of the top entries. Return CROP: x=0, y=0, width=[full_width], height=[total_height] for the first 15-20 lines.";
                const sitemapAiRes = await analyzeImage(sitemapRawUrl, sitemapPrompt);
                const sMatch = sitemapAiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

                if (sMatch) {
                    const [_, sx, sy, sw, sh] = sMatch.map(Number);
                    const sitemapFinalBuffer = await sharp(sitemapViewportBuffer).extract({ left: sx, top: sy, width: sw, height: sh }).toBuffer();
                    robotsResult.sitemap.capture = await uploadBufferToCloudinary(sitemapFinalBuffer, `sitemap-final-${auditId}.png`, 'audit-captures');
                    robotsResult.sitemap.statut = 'SUCCESS';
                } else {
                    robotsResult.sitemap.capture = sitemapRawUrl;
                    robotsResult.sitemap.statut = 'SUCCESS';
                }
            } catch (sitemapErr) {
                console.error('[MODULE-ROBOTS] Sitemap navigation error:', sitemapErr);
                robotsResult.sitemap.statut = 'ERROR';
                robotsResult.sitemap.details = `Erreur de navigation: ${sitemapErr.message}`;
            }
        } else if (robotsResult.sitemap.statut !== 'SUCCESS') {
            robotsResult.sitemap.statut = 'ERROR';
            robotsResult.sitemap.details = "Lien non trouvé dans robots.txt";
        }

    } catch (err) {
        console.error('[MODULE-ROBOTS] Global error:', err);
        robotsResult.robots_txt.statut = 'ERROR';
    } finally {
        await browser.close();
    }

    return robotsResult;
}
