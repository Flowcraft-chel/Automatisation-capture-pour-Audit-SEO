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

            // 2. Rendu DOM avec lignes de contexte autour du sitemap
            await page.evaluate((info) => {
                if (!document.body) return;
                const text = document.body.textContent || "";
                const lines = text.split('\n');

                document.body.innerHTML = '';
                document.body.style.cssText = 'background: white !important; margin: 0; padding: 0 !important;';

                const container = document.createElement('div');
                container.id = 'robots-capture-container';
                container.style.cssText = 'display: inline-block; font-family: "Google Sans", Arial, sans-serif; font-size: 13px; line-height: 1.6; border: 1px solid #dadce0; background: #fff;';

                if (info.hasSitemap) {
                    // Collect indices of sitemap lines
                    const sitemapIndices = new Set();
                    info.lines.forEach(obj => sitemapIndices.add(obj.index));

                    // Build context: 2 lines before and 2 lines after each sitemap line
                    const showIndices = new Set();
                    for (const idx of sitemapIndices) {
                        for (let i = Math.max(0, idx - 2); i <= Math.min(lines.length - 1, idx + 2); i++) {
                            showIndices.add(i);
                        }
                    }

                    const sortedIndices = [...showIndices].sort((a, b) => a - b);
                    let lastIdx = -2;

                    sortedIndices.forEach(idx => {
                        // Add separator if there's a gap
                        if (idx > lastIdx + 1 && lastIdx >= 0) {
                            const sep = document.createElement('div');
                            sep.textContent = '  ···';
                            sep.style.cssText = 'color: #9aa0a6; font-style: italic; padding: 2px 12px; background: #f8f9fa; border-top: 1px solid #e8eaed; border-bottom: 1px solid #e8eaed;';
                            container.appendChild(sep);
                        }

                        const div = document.createElement('div');
                        div.textContent = lines[idx] || ' ';
                        if (sitemapIndices.has(idx)) {
                            // Sitemap line — highlighted
                            div.style.cssText = 'background: #e8f0fe !important; border-left: 4px solid #1a73e8 !important; padding: 4px 12px !important; font-weight: 600; color: #1a73e8 !important; font-family: "Roboto Mono", monospace; font-size: 13px;';
                        } else {
                            // Context line
                            div.style.cssText = 'padding: 2px 12px; color: #3c4043; font-family: "Roboto Mono", monospace; font-size: 13px;';
                        }
                        container.appendChild(div);
                        lastIdx = idx;
                    });
                } else {
                    // Affichage complet (max 40 lignes)
                    lines.slice(0, 40).forEach((line, idx) => {
                        const div = document.createElement('div');
                        div.textContent = line || ' ';
                        div.style.cssText = 'padding: 2px 12px; color: #3c4043; font-family: "Roboto Mono", monospace; font-size: 13px;' +
                            (idx % 2 === 0 ? 'background: #fff;' : 'background: #f8f9fa;');
                        container.appendChild(div);
                    });
                    if (lines.length > 40) {
                        const trunc = document.createElement('div');
                        trunc.textContent = `... (${lines.length - 40} lignes supplémentaires)`;
                        trunc.style.cssText = 'color: #9aa0a6; font-style: italic; padding: 4px 12px;';
                        container.appendChild(trunc);
                    }
                }

                document.body.appendChild(container);
            }, sitemapInfo);

            await page.waitForTimeout(1000);

            let robotsBuffer;
            const containerEl = await page.$('#robots-capture-container');
            if (containerEl) {
                robotsBuffer = await containerEl.screenshot();
            } else {
                robotsBuffer = await page.screenshot({ fullPage: false });
            }

            robotsResult.robots_txt.capture = await uploadBufferToCloudinary(robotsBuffer, `robots-final-${auditId}.png`, 'audit-captures');

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
                // Fetch the raw sitemap content first (XML pages don't have standard document.body)
                const sitemapResponse = await page.goto(robotsResult.sitemap.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                let rawText = '';
                try {
                    rawText = await sitemapResponse.text();
                } catch {
                    // Fallback: try to get text from page
                    rawText = await page.evaluate(() => {
                        return document.body?.textContent || document.documentElement?.textContent || '';
                    });
                }

                console.log(`[MODULE-ROBOTS] Sitemap raw text length: ${rawText.length}`);

                // Split into lines and keep max 15 non-empty lines
                const lines = rawText.split('\n').filter(l => l.trim()).slice(0, 15);

                if (lines.length === 0) {
                    robotsResult.sitemap.statut = 'WARNING';
                    robotsResult.sitemap.capture = null;
                    console.log('[MODULE-ROBOTS] Sitemap content is empty');
                } else {
                    // Build styled HTML with XML syntax highlighting
                    const htmlLines = lines.map((line, idx) => {
                        let html = line
                            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                            // XML tags → purple
                            .replace(/(&lt;\/?[\w:-]+)/g, '<span style="color:#8250df;font-weight:600;">$1</span>')
                            .replace(/(&gt;)/g, '<span style="color:#8250df;">$1</span>')
                            // URLs → blue
                            .replace(/(https?:\/\/[^\s<&]+)/g, '<span style="color:#1a73e8;">$1</span>')
                            // XML attributes → green
                            .replace(/(\w+)(=)/g, '<span style="color:#1e8e3e;">$1</span>$2');

                        const bg = idx % 2 === 0 ? '#fff' : '#f8f9fa';
                        return `<div style="padding:1px 16px;white-space:nowrap;background:${bg};">${html}</div>`;
                    }).join('');

                    const sitemapHtml = `<!doctype html>
<html><head><meta charset="utf-8"/><style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#fff;}</style></head>
<body>
<div id="sitemap-capture-container" style="display:inline-block;font-family:'Roboto Mono',monospace;font-size:13px;line-height:1.7;border:1px solid #dadce0;background:#fff;padding:8px 0;">
${htmlLines}
</div>
</body></html>`;

                    await page.setContent(sitemapHtml, { waitUntil: 'load' });
                    await page.waitForTimeout(500);

                    const sitemapContainer = await page.$('#sitemap-capture-container');
                    let sitemapBuffer;
                    if (sitemapContainer) {
                        sitemapBuffer = await sitemapContainer.screenshot();
                    } else {
                        sitemapBuffer = await page.screenshot({ fullPage: false });
                    }

                    robotsResult.sitemap.capture = await uploadBufferToCloudinary(sitemapBuffer, `sitemap-final-${auditId}.png`, 'audit-captures');
                    robotsResult.sitemap.statut = 'SUCCESS';
                    console.log('[MODULE-ROBOTS] ✅ Sitemap captured successfully');
                }
            } catch (err) {
                console.error("[MODULE-ROBOTS] Erreur Sitemap:", err.message);
                robotsResult.sitemap.statut = 'ERROR';
            }
        } else {
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
