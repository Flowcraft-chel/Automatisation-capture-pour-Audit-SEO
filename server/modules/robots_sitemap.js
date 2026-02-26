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
/**
 * Audit robots.txt et capture des preuves.
 */
export async function auditRobotsSitemap(url, auditId) {
    console.log(`[MODULE-ROBOTS] Début de l'audit pour : ${url}`);
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
        // --- ÉTAPE 1 : robots.txt ---
        console.log(`[MODULE-ROBOTS] Navigation vers : ${robotsUrl}`);
        const robotsResponse = await page.goto(robotsUrl, { waitUntil: 'networkidle', timeout: 30000 });

        if (!robotsResponse || robotsResponse.status() >= 400) {
            robotsResult.robots_txt.statut = 'ERROR';
            robotsResult.robots_txt.details = `Erreur HTTP : ${robotsResponse ? robotsResponse.status() : 'Pas de réponse'}`;
        } else {
            // Récupération du texte brut
            const rawText = await page.evaluate(() => document.body ? (document.body.textContent || document.body.innerText || '') : '');
            const lines = rawText.split('\n').filter(l => l.trim().length > 0);
            console.log(`[MODULE-ROBOTS] ${lines.length} lignes trouvées dans robots.txt`);

            // Recherche des lignes Sitemap
            const sitemapLines = [];
            const allSitemapUrls = [];
            lines.forEach((line, idx) => {
                if (line.toLowerCase().includes('sitemap:')) {
                    sitemapLines.push(idx);
                    const match = line.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                    if (match) allSitemapUrls.push(match[1]);
                }
            });

            if (allSitemapUrls.length > 0) {
                robotsResult.sitemap.url = allSitemapUrls[0];
                robotsResult.sitemap.allUrls = allSitemapUrls;
                robotsResult.sitemap.statut = 'EN_COURS';
                console.log(`[MODULE-ROBOTS] ${allSitemapUrls.length} sitemaps trouvés. Principal : ${allSitemapUrls[0]}`);
            } else {
                // Fallback : Test des URLs sitemap standards
                const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
                console.log(`[MODULE-ROBOTS] Aucun sitemap dans robots.txt. Test des fallbacks...`);

                for (const fallback of [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`]) {
                    try {
                        const check = await page.goto(fallback, { waitUntil: 'domcontentloaded', timeout: 10000 });
                        if (check && check.status() < 400) {
                            robotsResult.sitemap.url = fallback;
                            robotsResult.sitemap.statut = 'EN_COURS';
                            console.log(`[MODULE-ROBOTS] Sitemap trouvé via fallback : ${fallback}`);
                            break;
                        }
                    } catch { }
                }
            }

            // Reconstruction de la page avec un style pro et mise en évidence
            const contentDimensions = await page.evaluate((sitemapLineIndices) => {
                if (!document.body) {
                    const body = document.createElement('body');
                    document.documentElement.appendChild(body);
                }
                const text = document.body.textContent || document.body.innerText || '';
                const lines = text.split('\n');

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
                    if (line.trim().length === 0 && idx > 0) return;
                    const div = document.createElement('div');
                    div.textContent = line;

                    if (sitemapLineIndices.includes(idx)) {
                        div.style.cssText = `
                            background: rgba(56, 139, 253, 0.25);
                            border-left: 4px solid #58a6ff;
                            padding: 6px 12px;
                            margin: 6px 0;
                            border-radius: 4px;
                            font-weight: bold;
                            color: #ffffff;
                        `;
                    } else if (line.trim().startsWith('#')) {
                        div.style.cssText = 'color: #6e7681; padding: 2px 0;';
                    } else if (line.toLowerCase().startsWith('user-agent')) {
                        div.style.cssText = 'color: #ff7b72; padding: 2px 0; font-weight: bold;';
                    } else if (line.toLowerCase().startsWith('allow') || line.toLowerCase().startsWith('disallow')) {
                        div.style.cssText = 'color: #7ee787; padding: 2px 0;';
                    } else {
                        div.style.cssText = 'padding: 2px 0;';
                    }
                    container.appendChild(div);
                });

                document.body.appendChild(container);
                const rect = container.getBoundingClientRect();
                return { width: Math.ceil(rect.width) + 20, height: Math.ceil(rect.height) + 20 };
            }, sitemapLines);

            const robotsBuffer = await page.screenshot({ fullPage: false });
            const meta = await sharp(robotsBuffer).metadata();
            const finalWidth = Math.min(Math.max(contentDimensions.width, 400), meta.width);
            const finalHeight = Math.min(Math.max(contentDimensions.height, 100), meta.height);

            const robotsFinalBuffer = await sharp(robotsBuffer)
                .extract({ left: 0, top: 0, width: finalWidth, height: finalHeight })
                .toBuffer();

            robotsResult.robots_txt.capture = await uploadBufferToCloudinary(
                robotsFinalBuffer, `robots-final-${auditId}.png`, 'audit-captures'
            );
            robotsResult.robots_txt.statut = 'SUCCESS';
        }

        // --- ÉTAPE 2 : Capture du Sitemap ---
        console.log(`[MODULE-ROBOTS] Navigation vers Sitemap : ${robotsResult.sitemap.url || 'NON DÉTECTÉ'}`);
        try {
            if (robotsResult.sitemap.url) {
                await page.goto(robotsResult.sitemap.url, { waitUntil: 'networkidle', timeout: 30000 });
            } else {
                // Page d'erreur personnalisée si aucun sitemap n'est trouvé
                await page.setContent(`
                    <body style="background: #0d1117; color: #ff7b72; font-family: monospace; padding: 50px; text-align: center;">
                        <h1 style="border-bottom: 1px solid #30363d; padding-bottom: 20px;">⚠️ Sitemap non détecté</h1>
                        <p style="font-size: 18px; color: #c9d1d9;">Aucun lien sitemap n'a été trouvé dans robots.txt ni via fallback.</p>
                    </body>
                `);
            }

            const sitemapDimensions = await page.evaluate(() => {
                if (!document.body) {
                    const body = document.createElement('body');
                    document.documentElement.appendChild(body);
                }
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

                if (document.querySelector('h1')) {
                    container.innerHTML = document.body.innerHTML;
                } else {
                    const maxLines = Math.min(lines.length, 40);
                    for (let i = 0; i < maxLines; i++) {
                        const div = document.createElement('div');
                        div.textContent = lines[i];
                        if (lines[i].trim().startsWith('<') || lines[i].includes('://')) {
                            div.style.color = '#79c0ff';
                        }
                        container.appendChild(div);
                    }
                }

                document.body.appendChild(container);
                const rect = container.getBoundingClientRect();
                return { width: Math.ceil(rect.width) + 20, height: Math.ceil(rect.height) + 20 };
            });

            await page.waitForTimeout(500);
            const sitemapBuffer = await page.screenshot({ fullPage: false });
            const sMeta = await sharp(sitemapBuffer).metadata();
            const sWidth = Math.min(Math.max(sitemapDimensions.width, 400), sMeta.width);
            const sHeight = Math.min(Math.max(sitemapDimensions.height, 100), sMeta.height);

            const sFinalBuffer = await sharp(sitemapBuffer)
                .extract({ left: 0, top: 0, width: sWidth, height: sHeight })
                .toBuffer();

            robotsResult.sitemap.capture = await uploadBufferToCloudinary(
                sFinalBuffer, `sitemap-final-${auditId}.png`, 'audit-captures'
            );
            robotsResult.sitemap.statut = robotsResult.sitemap.url ? 'SUCCESS' : 'WARNING';

        } catch (sitemapErr) {
            console.error('[MODULE-ROBOTS] Erreur capture sitemap :', sitemapErr);
            robotsResult.sitemap.statut = 'ERROR';
            robotsResult.sitemap.details = `Erreur : ${sitemapErr.message}`;
        }

    } catch (err) {
        console.error('[MODULE-ROBOTS] Erreur globale :', err);
    } finally {
        await browser.close();
    }

    return robotsResult;
}
