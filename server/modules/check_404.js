import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';

/**
 * 404 Check — Capture from the Google Sheet audit "Erreurs 4xx et 5xx" tab
 * 
 * Process:
 * 1. Open the AUDIT sheet (not plan d'action)
 * 2. Navigate to "Erreurs 4xx et 5xx" tab
 * 3. Filter rows where "Code HTTP" = 404
 * 4. Keep only columns: "Page contenant le lien vers l'URL en erreur" + "Code HTTP"
 * 5. Capture screenshot, send to AI for cropping
 * 6. AI also extracts one of the 404 links → stored in "lien_404" field
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
        if (!match) return { croppedPath: imagePath, aiResponse: response };
        const [, x, y, w, h] = match.map(Number);
        const meta = await sharp(imagePath).metadata();
        const left = Math.min(x, meta.width - 10);
        const top = Math.min(y, meta.height - 10);
        const width = Math.min(w, meta.width - left);
        const height = Math.min(h, meta.height - top);
        if (width < 20 || height < 20) return { croppedPath: imagePath, aiResponse: response };
        const croppedPath = imagePath.replace('.png', '_cropped.png');
        await sharp(imagePath).extract({ left, top, width, height }).toFile(croppedPath);
        fs.unlinkSync(imagePath);
        return { croppedPath, aiResponse: response };
    } catch (e) {
        console.warn(`[404] AI crop failed: ${e.message}`);
        return { croppedPath: imagePath, aiResponse: '' };
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
        viewport: { width: 1600, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        locale: 'fr-FR'
    });

    if (googleCookies && googleCookies.length) {
        await context.addCookies(googleCookies);
    }

    const page = await context.newPage();
    page.setDefaultTimeout(90000);

    try {
        console.log(`[404] Opening audit sheet...`);
        await page.goto(sheetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Wait for spreadsheet grid
        try {
            await page.waitForSelector('#waffle-grid-container', { state: 'visible', timeout: 20000 });
        } catch {
            await page.waitForSelector('body', { state: 'visible', timeout: 5000 });
        }
        await page.addStyleTag({ content: SHEETS_HIDE_CSS });

        // Navigate to "Erreurs 4xx et 5xx" tab
        const tabNames = ['Erreurs 4xx et 5xx', 'Erreurs 4xx', 'Erreurs', 'Errors', '404'];
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
                if (tabResult.gid) {
                    const url = new URL(page.url());
                    url.hash = `gid=${tabResult.gid}`;
                    await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: 60000 });
                }
                await page.addStyleTag({ content: SHEETS_HIDE_CSS });
                await page.waitForTimeout(3000);
                found = true;
                break;
            }
        }

        if (!found) {
            console.log('[404] No "Erreurs 4xx et 5xx" tab found in sheet');
            result.details = 'Onglet "Erreurs 4xx et 5xx" non trouvé dans le Google Sheet';
            return result;
        }

        // Wait for waffle grid to load
        try {
            await page.waitForSelector('.waffle tbody tr', { state: 'attached', timeout: 15000 });
        } catch (e) {
            console.log('[404] .waffle not found after tab navigation');
        }

        // Filter & extract: keep only rows with Code HTTP = 404, show only 2 columns
        const errorData = await page.evaluate(() => {
            const tableSelectors = ['.waffle tbody tr', '.waffle tr', '#sheets-viewport table tr', '.grid-container table tr'];
            let allRows = [];
            for (const sel of tableSelectors) {
                const elts = Array.from(document.querySelectorAll(sel));
                allRows = elts.filter(el => !el.closest('#docs-header') && !el.closest('.grid-bottom-bar') && !el.closest('.docs-sheet-tab-bar'));
                if (allRows.length > 1) break;
            }

            if (allRows.length <= 1) return { error: 'No table rows found' };

            // Find header row
            const knownHeaders = ['url', 'page', 'lien', 'code', 'http', 'erreur', 'destination'];
            let headerIdx = 0;
            for (let i = 0; i < Math.min(allRows.length, 5); i++) {
                const texts = Array.from(allRows[i].children).map(c => c.innerText.trim().toLowerCase());
                if (texts.some(t => knownHeaders.some(kw => t.includes(kw)))) {
                    headerIdx = i;
                    break;
                }
            }

            const rows = allRows.slice(headerIdx);
            const headers = Array.from(rows[0]?.children || []);
            const headerTexts = headers.map(h => h.innerText.trim().toLowerCase());

            // Find "Page contenant le lien vers l'URL en erreur" column
            const pageCol = headerTexts.findIndex(h =>
                h.includes('page contenant') || h.includes('lien vers') || h.includes('page source') || h.includes('url')
            );

            // Find "Code HTTP" column
            const codeCol = headerTexts.findIndex(h =>
                h.includes('code http') || h.includes('code') || h.includes('status') || h.includes('http')
            );

            if (codeCol === -1) return { error: 'Colonne "Code HTTP" introuvable', headerTexts };

            const tbody = rows[0]?.parentElement || document.querySelector('.waffle tbody');
            if (!tbody) return { error: 'tbody not found' };

            const dataRows = rows.slice(1);
            let first404Url = null;
            let count404 = 0;

            // Filter: show only rows with Code HTTP = 404
            dataRows.forEach(tr => {
                const codeText = (tr.children[codeCol]?.innerText || '').trim();
                const is404 = codeText === '404' || codeText.includes('404');
                tr.style.display = is404 ? '' : 'none';
                if (is404) {
                    count404++;
                    if (!first404Url && pageCol !== -1) {
                        first404Url = (tr.children[pageCol]?.innerText || '').trim();
                    }
                }
            });

            // Sort 404s to top
            dataRows.filter(tr => tr.style.display !== 'none').forEach(tr => tbody.appendChild(tr));
            dataRows.filter(tr => tr.style.display === 'none').forEach(tr => tbody.appendChild(tr));

            // Hide all columns except "Page contenant..." and "Code HTTP"
            const keepCols = [pageCol, codeCol].filter(i => i !== -1);
            rows.forEach(tr => {
                Array.from(tr.children).forEach((td, idx) => {
                    if (!keepCols.includes(idx)) td.style.display = 'none';
                });
            });

            // Also hide overlay rows before header
            for (let i = 0; i < headerIdx; i++) {
                allRows[i].style.display = 'none';
            }

            return { first404Url, count404, totalRows: dataRows.length };
        });

        if (errorData.error) {
            console.log(`[404] Error during filtering: ${errorData.error}`);
            result.details = errorData.error;
            return result;
        }

        console.log(`[404] Found ${errorData.count404} rows with Code HTTP 404 out of ${errorData.totalRows} total`);

        if (errorData.count404 === 0) {
            result.statut = 'SKIP';
            result.details = 'Aucune erreur 404 trouvée';
            return result;
        }

        // Extract first 404 URL directly
        if (errorData.first404Url) {
            result.lien404 = errorData.first404Url;
            console.log(`[404] First 404 link: ${errorData.first404Url}`);
        }

        await page.waitForTimeout(1000);

        // Take screenshot
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const tmpPath = path.join(tmpDir, `temp_404_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Tu es un expert en rognage d'images.
Cette image est une capture d'un onglet Google Sheets montrant les erreurs 404.
Tu vois un tableau avec deux colonnes : "Page contenant le lien vers l'URL en erreur" et "Code HTTP".

RÈGLES STRICTES :
1. CONSERVE ABSOLUMENT la ligne d'en-tête avec les noms de colonnes
2. Ne garde que les lignes avec le code 404
3. Supprime tout ce qui n'est pas le tableau (menus, barres, marges vides)
4. Le résultat doit être un tableau SERRÉ
5. Extrais aussi UN des liens 404 visibles et renvoie-le

Réponds avec :
LIEN404: [un des liens 404 visibles dans le tableau]
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const { croppedPath, aiResponse } = await cropWithAI(tmpPath, prompt);

        // Try to extract link from AI response if we didn't get one from the DOM
        if (!result.lien404 && aiResponse) {
            const linkMatch = aiResponse.match(/LIEN404:\s*(.+)/i);
            if (linkMatch) {
                result.lien404 = linkMatch[1].trim();
                console.log(`[404] AI extracted 404 link: ${result.lien404}`);
            }
        }

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
