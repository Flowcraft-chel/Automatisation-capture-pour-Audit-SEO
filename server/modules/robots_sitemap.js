import { chromium } from 'playwright';
import { uploadBufferToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';
import sharp from 'sharp';

/**
 * Audit robots.txt and capture evidence.
 * 
 * INTELLIGENT CAPTURE STRATEGY:
 * 1. Open robots.txt → apply dark professional CSS
 * 2. If Sitemap line exists → highlight it with a colored background
 * 3. Take a screenshot of the FULL visible content (not just a tiny line)
 * 4. AI crops to remove empty right margin but KEEPS ALL text lines visible
 * 5. If no sitemap → capture the first lines of the file
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
                    line-height: 1.8 !important;
                    font-size: 18px !important;
                    margin: 0 !important;
                    white-space: pre-wrap !important;
                    word-wrap: break-word !important;
                }
                pre { margin: 0 !important; white-space: pre-wrap !important; font-size: 18px !important; line-height: 1.8 !important; }
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

            // Find all sitemap lines and highlight them
            const sitemapInfo = await page.evaluate(() => {
                const text = document.body.textContent || document.body.innerText || "";
                const lines = text.split('\n');
                const sitemapLines = [];
                let firstSitemapUrl = null;

                lines.forEach((line, idx) => {
                    if (line.toLowerCase().includes('sitemap:')) {
                        sitemapLines.push({ index: idx, text: line.trim() });
                        if (!firstSitemapUrl) {
                            const match = line.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                            if (match) firstSitemapUrl = match[1];
                        }
                    }
                });

                return {
                    hasSitemap: sitemapLines.length > 0,
                    sitemapLines,
                    firstSitemapUrl,
                    totalLines: lines.length
                };
            });

            console.log(`[MODULE-ROBOTS] Sitemap info: ${JSON.stringify(sitemapInfo)}`);

            if (sitemapInfo.firstSitemapUrl) {
                robotsResult.sitemap.url = sitemapInfo.firstSitemapUrl;
                robotsResult.sitemap.statut = 'EN_COURS';
            }

            // Highlight sitemap lines with a colored background for visibility
            if (sitemapInfo.hasSitemap) {
                await page.evaluate((sitemapLines) => {
                    const text = document.body.textContent || document.body.innerText || "";
                    const lines = text.split('\n');

                    // Rebuild the body content with highlighted sitemap lines
                    const container = document.createElement('div');
                    container.style.cssText = 'padding: 40px; font-family: "Fira Code", "Courier New", monospace; font-size: 18px; line-height: 1.8; color: #c9d1d9; background: #0d1117;';

                    lines.forEach((line, idx) => {
                        const div = document.createElement('div');
                        div.textContent = line;
                        const isSitemap = sitemapLines.some(s => s.index === idx);
                        if (isSitemap) {
                            div.style.cssText = 'background: rgba(56, 139, 253, 0.15); border-left: 3px solid #58a6ff; padding: 4px 8px; margin: 4px 0; border-radius: 4px;';
                        } else {
                            div.style.cssText = 'padding: 2px 0;';
                        }
                        container.appendChild(div);
                    });

                    document.body.innerHTML = '';
                    document.body.style.cssText = 'background: #0d1117; margin: 0; padding: 0;';
                    document.body.appendChild(container);
                }, sitemapInfo.sitemapLines);
            }

            await page.waitForTimeout(500);

            // Take screenshot — the whole viewport (not fullPage, the content is short)
            const robotsViewportBuffer = await page.screenshot({ fullPage: false });
            const robotsRawUrl = await uploadBufferToCloudinary(robotsViewportBuffer, `robots-raw-${auditId}.png`, 'audit-temp');

            // AI prompt: crop to keep ALL text content, remove empty space
            const robotsPrompt = sitemapInfo.hasSitemap
                ? `Cette image montre un fichier robots.txt avec des lignes de type Sitemap surlignées en bleu.
RÈGLES DE ROGNAGE :
1. CONSERVE TOUTES les lignes de texte visibles, y compris les lignes Sitemap surlignées
2. Supprime uniquement l'espace vide en bas et à droite (là où il n'y a pas de texte)
3. NE coupe PAS le texte — garde une marge de 20px autour du contenu
4. La largeur doit couvrir tout le texte visible
5. La hauteur doit aller du haut du premier texte au bas du dernier texte
Réponds UNIQUEMENT avec : CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`
                : `Cette image montre un fichier robots.txt.
RÈGLES DE ROGNAGE :
1. CONSERVE TOUTES les lignes de texte visibles
2. Supprime uniquement l'espace vide en bas et à droite
3. Garde une marge de 20px autour du contenu texte
Réponds UNIQUEMENT avec : CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

            const robotsAiRes = await analyzeImage(robotsRawUrl, robotsPrompt);
            console.log(`[MODULE-ROBOTS] AI response: ${robotsAiRes}`);
            const rMatch = robotsAiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

            if (rMatch) {
                let [_, rx, ry, rw, rh] = rMatch.map(Number);
                const rMeta = await sharp(robotsViewportBuffer).metadata();
                rx = Math.max(0, rx);
                ry = Math.max(0, ry);
                rw = Math.min(rw, rMeta.width - rx);
                rh = Math.min(rh, rMeta.height - ry);

                // Safety: minimum dimensions to avoid tiny crops
                if (rw < 200) rw = Math.min(600, rMeta.width);
                if (rh < 100) rh = Math.min(400, rMeta.height);

                if (rw > 0 && rh > 0) {
                    const robotsFinalBuffer = await sharp(robotsViewportBuffer).extract({ left: rx, top: ry, width: rw, height: rh }).toBuffer();
                    robotsResult.robots_txt.capture = await uploadBufferToCloudinary(robotsFinalBuffer, `robots-final-${auditId}.png`, 'audit-captures');
                } else {
                    robotsResult.robots_txt.capture = robotsRawUrl;
                }
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

                const sitemapPrompt = `Cette image montre une page sitemap XML/HTML.
RÈGLES DE ROGNAGE :
1. CONSERVE TOUTES les lignes de texte/XML visibles
2. Supprime l'espace vide à droite et en bas
3. La largeur doit correspondre au texte visible (pas plus large)
4. Garde 20px de marge autour du contenu
Réponds UNIQUEMENT avec : CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

                const sitemapAiRes = await analyzeImage(sitemapRawUrl, sitemapPrompt);
                const sMatch = sitemapAiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

                if (sMatch) {
                    let [_, sx, sy, sw, sh] = sMatch.map(Number);
                    const sMeta = await sharp(sitemapViewportBuffer).metadata();
                    sx = Math.max(0, sx);
                    sy = Math.max(0, sy);
                    sw = Math.min(sw, sMeta.width - sx);
                    sh = Math.min(sh, sMeta.height - sy);

                    // Safety minimums
                    if (sw < 200) sw = Math.min(600, sMeta.width);
                    if (sh < 100) sh = Math.min(400, sMeta.height);

                    if (sw > 0 && sh > 0) {
                        const sitemapFinalBuffer = await sharp(sitemapViewportBuffer).extract({ left: sx, top: sy, width: sw, height: sh }).toBuffer();
                        robotsResult.sitemap.capture = await uploadBufferToCloudinary(sitemapFinalBuffer, `sitemap-final-${auditId}.png`, 'audit-captures');
                        robotsResult.sitemap.statut = 'SUCCESS';
                    } else {
                        robotsResult.sitemap.capture = sitemapRawUrl;
                        robotsResult.sitemap.statut = 'SUCCESS';
                    }
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
