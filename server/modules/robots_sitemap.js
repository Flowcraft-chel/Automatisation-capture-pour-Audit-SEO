/**
 * robots_sitemap.js
 * Version restaurée avec rognage IA et fond blanc pour une visibilité maximale.
 * Gère plusieurs sitemaps, les fallbacks et évite les crashs sur XML/Text.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadBufferToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';

/**
 * Audit robots.txt and detect sitemap(s).
 * Ensure a capture is ALWAYS generated even if no sitemap is found.
 */
export async function auditRobotsSitemap(url, auditId) {
    console.log(`[MODULE-ROBOTS] Début de l'audit pour : ${url}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    // Viewport standard pour une capture lisible
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    let robotsUrl = url.endsWith('/') ? `${url}robots.txt` : `${url}/robots.txt`;

    const robotsResult = {
        robots_txt: { statut: 'EN_COURS', capture: null, url: robotsUrl },
        sitemap: { statut: 'EN_ATTENTE', url: null, capture: null }
    };

    try {
        console.log(`[MODULE-ROBOTS] Navigation vers : ${robotsUrl}`);
        const response = await page.goto(robotsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        if (!response || response.status() >= 400) {
            robotsResult.robots_txt.statut = 'ERROR';
            robotsResult.robots_txt.details = `Erreur HTTP: ${response ? response.status() : 'Pas de réponse'}`;
        } else {
            robotsResult.robots_txt.statut = 'SUCCESS';

            // 1. Analyse du contenu pour les sitemaps
            const sitemapInfo = await page.evaluate(() => {
                const body = document.body;
                if (!body) return { hasSitemap: false, lines: [], firstUrl: null };

                const text = body.textContent || body.innerText || "";
                const lines = text.split('\n');
                const sitemaps = [];
                let firstUrl = null;

                lines.forEach((line, idx) => {
                    const cleanLine = line.trim();
                    if (cleanLine.toLowerCase().startsWith('sitemap:')) {
                        const match = cleanLine.match(/sitemaps?:\s*(https?:\/\/\S+)/i);
                        if (match) {
                            if (!firstUrl) firstUrl = match[1];
                            sitemaps.push({ index: idx, text: cleanLine });
                        }
                    }
                });
                return { hasSitemap: sitemaps.length > 0, lines: sitemaps, firstUrl };
            });

            console.log(`[MODULE-ROBOTS] ${sitemapInfo.lines.length} sitemaps trouvés.`);

            // 2. Stylisation (Fond Blanc, Texte Noir, Sitemaps Jaunes)
            await page.evaluate((sitemapIndices) => {
                if (!document.body) return;
                const text = document.body.textContent || "";
                const lines = text.split('\n');

                document.body.innerHTML = '';
                document.body.style.cssText = 'background: white !important; margin: 0; padding: 40px !important; color: black !important; font-family: monospace; font-size: 16px; line-height: 1.5;';

                const container = document.createElement('div');
                lines.forEach((line, idx) => {
                    const div = document.createElement('div');
                    div.textContent = line || ' ';
                    if (sitemapIndices.includes(idx)) {
                        div.style.cssText = 'background: #fff3cd !important; border-left: 5px solid #ffc107 !important; padding: 5px 15px !important; margin: 5px 0 !important; font-weight: bold; color: black !important;';
                    } else {
                        div.style.padding = '2px 0';
                    }
                    container.appendChild(div);
                });
                document.body.appendChild(container);
            }, sitemapInfo.lines.map(l => l.index));

            await page.waitForTimeout(1000);
            const robotsBuffer = await page.screenshot({ fullPage: false });
            const robotsRawUrl = await uploadBufferToCloudinary(robotsBuffer, `robots-raw-${auditId}.png`, 'audit-temp');

            // 3. Rognage IA
            const prompt = `Cette image montre un fichier robots.txt. Les lignes de type Sitemap sont surlignées en jaune.
RÈGLES DE ROGNAGE :
1. CONSERVE TOUTES les lignes de texte visibles.
2. Supprime l'espace vide blanc à droite et en bas.
3. La largeur doit être ajustée au texte le plus long.
Réponds UNIQUEMENT avec : CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

            const aiRes = await analyzeImage(robotsRawUrl, prompt);
            const match = aiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

            if (match) {
                let [_, rx, ry, rw, rh] = match.map(Number);
                const meta = await sharp(robotsBuffer).metadata();
                rx = Math.max(0, rx); ry = Math.max(0, ry);
                rw = Math.min(rw, meta.width - rx); rh = Math.min(rh, meta.height - ry);

                if (rw > 50 && rh > 20) {
                    const finalBuffer = await sharp(robotsBuffer).extract({ left: rx, top: ry, width: rw, height: rh }).toBuffer();
                    robotsResult.robots_txt.capture = await uploadBufferToCloudinary(finalBuffer, `robots-final-${auditId}.png`, 'audit-captures');
                } else {
                    robotsResult.robots_txt.capture = robotsRawUrl;
                }
            } else {
                robotsResult.robots_txt.capture = robotsRawUrl;
            }

            if (sitemapInfo.firstUrl) robotsResult.sitemap.url = sitemapInfo.firstUrl;
        }

        // --- STAGE 2: Sitemap Navigation & Capture ---
        if (!robotsResult.sitemap.url) {
            console.log("[MODULE-ROBOTS] Pas de sitemap direct. Test des fallbacks...");
            const fallbacks = [`${url}/sitemap.xml`, `${url}/sitemap_index.xml`];
            for (const fb of fallbacks) {
                try {
                    const res = await page.goto(fb, { timeout: 10000 });
                    if (res && res.status() < 400) {
                        robotsResult.sitemap.url = fb;
                        break;
                    }
                } catch { }
            }
        }

        if (robotsResult.sitemap.url) {
            console.log(`[MODULE-ROBOTS] Capture Sitemap : ${robotsResult.sitemap.url}`);
            try {
                await page.goto(robotsResult.sitemap.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                await page.evaluate(() => {
                    if (!document.body) return;
                    const text = document.body.textContent || "";
                    document.body.innerHTML = '';
                    document.body.style.cssText = 'background: white !important; color: black !important; padding: 40px !important; font-family: monospace; font-size: 14px; white-space: pre-wrap;';
                    document.body.textContent = text.split('\n').slice(0, 40).join('\n');
                });

                await page.waitForTimeout(1000);
                const sitemapBuffer = await page.screenshot({ fullPage: false });
                const sitemapRawUrl = await uploadBufferToCloudinary(sitemapBuffer, `sitemap-raw-${auditId}.png`, 'audit-temp');

                const sPrompt = `Cette image montre un sitemap.
RÈGLES DE ROGNAGE :
1. Garde le texte utile (URLs).
2. Supprime l'espace blanc à droite et en bas.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

                const sAiRes = await analyzeImage(sitemapRawUrl, sPrompt);
                const sMatch = sAiRes.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);

                if (sMatch) {
                    let [_, sx, sy, sw, sh] = sMatch.map(Number);
                    const smeta = await sharp(sitemapBuffer).metadata();
                    sx = Math.max(0, sx); sy = Math.max(0, sy);
                    sw = Math.min(sw, smeta.width - sx); sh = Math.min(sh, smeta.height - sy);

                    if (sw > 50 && sh > 20) {
                        const sFinal = await sharp(sitemapBuffer).extract({ left: sx, top: sy, width: sw, height: sh }).toBuffer();
                        robotsResult.sitemap.capture = await uploadBufferToCloudinary(sFinal, `sitemap-final-${auditId}.png`, 'audit-captures');
                        robotsResult.sitemap.statut = 'SUCCESS';
                    } else {
                        robotsResult.sitemap.capture = sitemapRawUrl;
                        robotsResult.sitemap.statut = 'SUCCESS';
                    }
                } else {
                    robotsResult.sitemap.capture = sitemapRawUrl;
                    robotsResult.sitemap.statut = 'SUCCESS';
                }
            } catch (err) {
                console.error("[MODULE-ROBOTS] Erreur Sitemap:", err.message);
                robotsResult.sitemap.statut = 'ERROR';
            }
        } else {
            // Error Page Capture (Fond Blanc)
            console.log("[MODULE-ROBOTS] Sitemap NON DÉTECTÉ.");
            await page.setContent(`
                <body style="background: white; color: #d73a49; font-family: sans-serif; padding: 60px; text-align: center; border: 15px solid #f6f8fa;">
                    <h1 style="font-size: 36px; margin-bottom: 20px;">⚠️ Sitemap non détecté</h1>
                    <p style="font-size: 18px; color: #586069;">Le fichier sitemap n'est pas déclaré dans robots.txt et aucun fallback n'a fonctionné.</p>
                </body>
            `);
            const errBuffer = await page.screenshot({ fullPage: false });
            const errUrl = await uploadBufferToCloudinary(errBuffer, `sitemap-notfound-${auditId}.png`, 'audit-captures');
            robotsResult.sitemap.capture = errUrl;
            robotsResult.sitemap.statut = 'WARNING';
        }

    } catch (err) {
        console.error('[MODULE-ROBOTS] Global error:', err);
        robotsResult.robots_txt.statut = 'ERROR';
    } finally {
        await browser.close();
    }
    return robotsResult;
}
