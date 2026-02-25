import { chromium } from 'playwright';
import { uploadBufferToCloudinary } from '../utils/cloudinary.js';
import sharp from 'sharp';

/**
 * Audit robots.txt and capture evidence.
 * 
 * PROGRAMMATIC CROP (no AI dependency):
 * 1. Open robots.txt → apply dark professional CSS
 * 2. Highlight Sitemap lines in blue
 * 3. Measure actual text content dimensions in the browser
 * 4. Crop programmatically with sharp based on measured dimensions
 * 5. Same for sitemap page
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

    try {
        // --- STAGE 1: robots.txt ---
        console.log(`[MODULE-ROBOTS] Navigating to: ${robotsUrl}`);
        const robotsResponse = await page.goto(robotsUrl, { waitUntil: 'networkidle', timeout: 30000 });

        if (!robotsResponse || robotsResponse.status() >= 400) {
            robotsResult.robots_txt.statut = 'ERROR';
            robotsResult.robots_txt.details = `Erreur HTTP: ${robotsResponse ? robotsResponse.status() : 'No response'}`;
        } else {
            // Get the raw text content
            const rawText = await page.evaluate(() => document.body.textContent || document.body.innerText || '');
            const lines = rawText.split('\n').filter(l => l.trim().length > 0);
            console.log(`[MODULE-ROBOTS] Found ${lines.length} lines in robots.txt`);

            // Find sitemap lines
            const sitemapLines = [];
            let firstSitemapUrl = null;
            lines.forEach((line, idx) => {
                if (line.toLowerCase().includes('sitemap:')) {
                    sitemapLines.push(idx);
                    if (!firstSitemapUrl) {
                        const match = line.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                        if (match) firstSitemapUrl = match[1];
                    }
                }
            });

            if (firstSitemapUrl) {
                robotsResult.sitemap.url = firstSitemapUrl;
                robotsResult.sitemap.statut = 'EN_COURS';
                console.log(`[MODULE-ROBOTS] Found sitemap URL: ${firstSitemapUrl}`);
            }

            // Rebuild the page content with professional styling and highlighting
            const contentDimensions = await page.evaluate((sitemapLineIndices) => {
                const text = document.body.textContent || document.body.innerText || '';
                const lines = text.split('\n');

                // Clear body and rebuild
                document.body.innerHTML = '';
                document.body.style.cssText = 'background: #0d1117; margin: 0; padding: 0; overflow: hidden;';

                const container = document.createElement('div');
                container.id = 'robots-content';
                container.style.cssText = `
                    padding: 30px 40px;
                    font-family: 'Fira Code', 'Courier New', monospace;
                    font-size: 16px;
                    line-height: 1.7;
                    color: #c9d1d9;
                    background: #0d1117;
                    display: inline-block;
                    min-width: 400px;
                `;

                lines.forEach((line, idx) => {
                    if (line.trim().length === 0 && idx > 0) return; // Skip empty lines except first
                    const div = document.createElement('div');
                    div.textContent = line;

                    const isSitemap = sitemapLineIndices.includes(idx);
                    if (isSitemap) {
                        div.style.cssText = `
                            background: rgba(56, 139, 253, 0.15);
                            border-left: 3px solid #58a6ff;
                            padding: 6px 12px;
                            margin: 4px 0;
                            border-radius: 4px;
                            font-weight: bold;
                            color: #79c0ff;
                        `;
                    } else if (line.trim().startsWith('#')) {
                        div.style.cssText = 'color: #6e7681; padding: 2px 0;'; // Comments in grey
                    } else if (line.toLowerCase().startsWith('user-agent')) {
                        div.style.cssText = 'color: #ff7b72; padding: 2px 0; font-weight: bold;'; // User-agent in red
                    } else if (line.toLowerCase().startsWith('allow') || line.toLowerCase().startsWith('disallow')) {
                        div.style.cssText = 'color: #7ee787; padding: 2px 0;'; // Allow/Disallow in green
                    } else {
                        div.style.cssText = 'padding: 2px 0;';
                    }
                    container.appendChild(div);
                });

                document.body.appendChild(container);

                // Measure actual content dimensions
                const rect = container.getBoundingClientRect();
                return {
                    width: Math.ceil(rect.width) + 20,  // +20px padding
                    height: Math.ceil(rect.height) + 20
                };
            }, sitemapLines);

            console.log(`[MODULE-ROBOTS] Content dimensions: ${contentDimensions.width}x${contentDimensions.height}`);

            await page.waitForTimeout(500);

            // Take full viewport screenshot
            const robotsBuffer = await page.screenshot({ fullPage: false });

            // Programmatic crop based on measured content dimensions
            const meta = await sharp(robotsBuffer).metadata();
            const cropWidth = Math.min(contentDimensions.width, meta.width);
            const cropHeight = Math.min(contentDimensions.height, meta.height);

            // Safety: minimum dimensions
            const finalWidth = Math.max(cropWidth, 400);
            const finalHeight = Math.max(cropHeight, 100);

            console.log(`[MODULE-ROBOTS] Cropping to: ${finalWidth}x${finalHeight}`);

            const robotsFinalBuffer = await sharp(robotsBuffer)
                .extract({
                    left: 0,
                    top: 0,
                    width: Math.min(finalWidth, meta.width),
                    height: Math.min(finalHeight, meta.height)
                })
                .toBuffer();

            robotsResult.robots_txt.capture = await uploadBufferToCloudinary(
                robotsFinalBuffer, `robots-final-${auditId}.png`, 'audit-captures'
            );
            robotsResult.robots_txt.statut = 'SUCCESS';
        }

        // --- STAGE 2: Actual Sitemap Page ---
        if (robotsResult.sitemap.url) {
            console.log(`[MODULE-ROBOTS] Navigating to Actual Sitemap: ${robotsResult.sitemap.url}`);
            try {
                await page.goto(robotsResult.sitemap.url, { waitUntil: 'networkidle', timeout: 30000 });

                // Apply professional CSS for sitemap too
                const sitemapDimensions = await page.evaluate(() => {
                    const text = document.body.textContent || document.body.innerText || '';
                    const lines = text.split('\n');

                    document.body.innerHTML = '';
                    document.body.style.cssText = 'background: #0d1117; margin: 0; padding: 0; overflow: hidden;';

                    const container = document.createElement('div');
                    container.style.cssText = `
                        padding: 30px 40px;
                        font-family: 'Fira Code', 'Courier New', monospace;
                        font-size: 14px;
                        line-height: 1.5;
                        color: #c9d1d9;
                        background: #0d1117;
                        display: inline-block;
                        min-width: 400px;
                    `;

                    // Show first ~40 lines of sitemap
                    const maxLines = Math.min(lines.length, 40);
                    for (let i = 0; i < maxLines; i++) {
                        const div = document.createElement('div');
                        div.textContent = lines[i];
                        if (lines[i].trim().startsWith('<') || lines[i].includes('://')) {
                            div.style.color = '#79c0ff'; // URLs in blue
                        }
                        container.appendChild(div);
                    }

                    if (lines.length > 40) {
                        const more = document.createElement('div');
                        more.textContent = `... (${lines.length - 40} more lines)`;
                        more.style.cssText = 'color: #6e7681; font-style: italic; margin-top: 10px;';
                        container.appendChild(more);
                    }

                    document.body.appendChild(container);

                    const rect = container.getBoundingClientRect();
                    return {
                        width: Math.ceil(rect.width) + 20,
                        height: Math.ceil(rect.height) + 20
                    };
                });

                await page.waitForTimeout(500);
                const sitemapBuffer = await page.screenshot({ fullPage: false });
                const sMeta = await sharp(sitemapBuffer).metadata();

                const sWidth = Math.min(Math.max(sitemapDimensions.width, 400), sMeta.width);
                const sHeight = Math.min(Math.max(sitemapDimensions.height, 100), sMeta.height);

                const sitemapFinalBuffer = await sharp(sitemapBuffer)
                    .extract({ left: 0, top: 0, width: sWidth, height: sHeight })
                    .toBuffer();

                robotsResult.sitemap.capture = await uploadBufferToCloudinary(
                    sitemapFinalBuffer, `sitemap-final-${auditId}.png`, 'audit-captures'
                );
                robotsResult.sitemap.statut = 'SUCCESS';

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
