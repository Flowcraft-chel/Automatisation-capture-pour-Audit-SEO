import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';

/**
 * 404 Check — Capture from the Google Sheet "Erreurs" tab
 * The audit Google Sheet contains a tab listing 404 errors.
 * This module opens that tab, filters for 404 status codes, and captures the result.
 * Also extracts the first 404 URL as lien_404.
 */

const SHEETS_HIDE_CSS = `
    .docs-menubar, .docs-toolbar-container, .docs-header-clip,
    .grid-bottom-bar, .docs-sheet-tab-bar, #docs-header,
    .docs-titlebar-container, .waffle-comments-overlay { display: none !important; }
    body { margin: 0; padding: 0; }
`;

async function cropWithAI(imagePath, prompt) {
    try {
        const sharp = (await import('sharp')).default;
        const response = await analyzeImage(imagePath, prompt);
        const match = response.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);
        if (!match) return imagePath;
        const [, x, y, w, h] = match.map(Number);
        const meta = await sharp(imagePath).metadata();
        const left = Math.min(x, meta.width - 10);
        const top = Math.min(y, meta.height - 10);
        const width = Math.min(w, meta.width - left);
        const height = Math.min(h, meta.height - top);
        if (width < 20 || height < 20) return imagePath;
        const croppedPath = imagePath.replace('.png', '_cropped.png');
        await sharp(imagePath).extract({ left, top, width, height }).toFile(croppedPath);
        fs.unlinkSync(imagePath);
        return croppedPath;
    } catch (e) {
        console.warn(`[404] AI crop failed: ${e.message}`);
        return imagePath;
    }
}

export async function check404(sheetUrl, auditId, googleCookies) {
    const result = { statut: 'SKIP', capture: null, lien404: null };

    if (!sheetUrl) {
        result.details = 'Lien Google Sheet non fourni';
        return result;
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
    });

    // Inject Google cookies if available
    if (googleCookies && googleCookies.length) {
        await context.addCookies(googleCookies);
    }

    const page = await context.newPage();

    try {
        console.log(`[404] Opening sheet to find Erreurs tab...`);
        await page.goto(sheetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.addStyleTag({ content: SHEETS_HIDE_CSS });
        await page.waitForTimeout(5000);

        // Try to find the "Erreurs" tab (or similar: "Errors", "Pages en erreur", "404")
        const tabNames = ['Erreurs', 'Errors', 'Pages en erreur', '404', 'Erreur'];
        let found = false;

        for (const tabName of tabNames) {
            // Show tabs briefly
            await page.evaluate(() => {
                const bar = document.querySelector('.docs-sheet-tab-bar') || document.querySelector('.grid-bottom-bar');
                if (bar) bar.style.display = 'block';
            });
            await page.waitForTimeout(1000);

            const tabResult = await page.evaluate((name) => {
                const tabSelectors = ['.docs-sheet-tab-name', '.docs-sheet-tab span', '.docs-sheet-tab .docs-sheet-tab-caption'];
                let tabs = [];
                for (const sel of tabSelectors) {
                    tabs = Array.from(document.querySelectorAll(sel));
                    if (tabs.length > 0) break;
                }
                const target = tabs.find(t => t.innerText.trim().toLowerCase().includes(name.toLowerCase()));
                if (!target) return { found: false };

                const parent = target.closest('.docs-sheet-tab');
                let gid = null;
                if (parent?.id?.startsWith('sheet-button-')) gid = parent.id.replace('sheet-button-', '');
                if (!gid && parent) {
                    const dataId = parent.getAttribute('data-id');
                    if (dataId) gid = dataId;
                }
                return { found: true, gid, name: target.innerText.trim() };
            }, tabName);

            if (tabResult.found) {
                console.log(`[404] Found tab: "${tabResult.name}" (gid=${tabResult.gid})`);

                // Navigate to the tab
                if (tabResult.gid) {
                    const url = new URL(page.url());
                    url.hash = `gid=${tabResult.gid}`;
                    await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 60000 });
                }

                await page.addStyleTag({ content: SHEETS_HIDE_CSS });
                await page.waitForTimeout(5000);
                found = true;
                break;
            }
        }

        if (!found) {
            console.log('[404] No "Erreurs" tab found in sheet');
            result.details = 'Onglet "Erreurs" non trouvé dans le Google Sheet';
            return result;
        }

        // Extract first 404 URL from the table
        const errorData = await page.evaluate(() => {
            const tableSelectors = ['.waffle tbody tr', '.waffle tr', 'table tr'];
            let rows = [];
            for (const sel of tableSelectors) {
                rows = Array.from(document.querySelectorAll(sel));
                if (rows.length > 1) break;
            }

            // Find header row
            const knownHeaders = ['url', 'destination', 'code', 'status', 'erreur', '404'];
            let headerIdx = 0;
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const texts = Array.from(rows[i].children).map(c => c.innerText.trim().toLowerCase());
                if (texts.some(t => knownHeaders.some(kw => t.includes(kw)))) {
                    headerIdx = i;
                    break;
                }
            }

            const dataRows = rows.slice(headerIdx + 1);
            const headers = Array.from(rows[headerIdx]?.children || []).map(h => h.innerText.trim().toLowerCase());

            // Find URL column and status/code column
            const urlCol = headers.findIndex(h => h.includes('url') || h.includes('destination') || h.includes('adress'));
            const codeCol = headers.findIndex(h => h.includes('code') || h.includes('status') || h.includes('404'));

            let first404Url = null;
            for (const row of dataRows) {
                const cells = Array.from(row.children);
                const code = cells[codeCol]?.innerText?.trim();
                if (code && (code.includes('404') || code.toLowerCase().includes('not found'))) {
                    first404Url = cells[urlCol]?.innerText?.trim();
                    if (first404Url) break;
                }
            }

            return { first404Url, totalRows: dataRows.length };
        });

        if (errorData.first404Url) {
            result.lien404 = errorData.first404Url;
            console.log(`[404] First 404 URL: ${errorData.first404Url}`);
        }

        // Take screenshot
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const tmpPath = path.join(tmpDir, `temp_404_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Cette image est une capture d'un onglet Google Sheets montrant les erreurs 404.
Rogne pour ne garder que le tableau avec les URLs et codes d'erreur.
Supprime tout le contenu qui n'est pas le tableau de données.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const croppedPath = await cropWithAI(tmpPath, prompt);
        const uploaded = await uploadToCloudinary(croppedPath, `audit-results/404-${auditId}`);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
        if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';

    } catch (e) {
        result.details = e.message;
        console.error('[404] Error:', e.message);
    } finally {
        await browser.close();
    }

    return result;
}
