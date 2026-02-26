/**
 * sheet_plan_capture.js
 * Captures Plan d'Action Google Sheets tabs directly via Playwright.
 * Uses Google OAuth cookies (from user session) to authenticate.
 * Takes screenshots of the visible content for each tab.
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';

// ── Plan d'action tabs to capture ──────────────────────────────────────────────
const PLAN_TABS = [
    {
        airtableField: "Img_planD'action",
        gid: null,  // Will be resolved dynamically
        tabName: "Synthèse Audit - Plan d'action",
    },
    {
        airtableField: "Img_Requetes_cles",
        gid: null,
        tabName: "Requêtes Clés / Calédito",
    },
    {
        airtableField: "Img_donnee image",
        gid: null,
        tabName: "Données Images",
    },
    {
        airtableField: "Img_longeur_page_plan",
        gid: null,
        tabName: "Longueur de page",
    },
];

// ── AI crop helper ────────────────────────────────────────────────────────────
async function cropWithAI(imagePath, prompt) {
    try {
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
        if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        return croppedPath;
    } catch (e) {
        console.warn(`[PLAN-CAPTURE] AI crop failed: ${e.message}`);
        return imagePath;
    }
}

/**
 * Capture all Plan d'Action tabs from Google Sheets.
 * @param {string} sheetPlanUrl - URL of the Plan d'Action Google Sheet
 * @param {string} auditId - Unique audit identifier
 * @param {Array} googleCookies - Google session cookies for authentication
 * @returns {Object} Results keyed by Airtable field name
 */
export async function capturePlanDAction(sheetPlanUrl, auditId, googleCookies) {
    const results = {};

    if (!sheetPlanUrl) {
        for (const tab of PLAN_TABS) {
            results[tab.airtableField] = { statut: 'SKIP', details: 'Lien Google Sheet plan d\'action non fourni' };
        }
        return results;
    }

    if (!googleCookies || !googleCookies.length) {
        for (const tab of PLAN_TABS) {
            results[tab.airtableField] = { statut: 'SKIP', details: 'Session Google non connectée' };
        }
        return results;
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        viewport: { width: 1600, height: 1000 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: 'fr-FR'
    });

    await context.addCookies(googleCookies);
    const page = await context.newPage();
    page.setDefaultTimeout(60000);

    try {
        // Navigate to the sheet first to get tab GIDs
        console.log(`[PLAN-CAPTURE] Opening sheet: ${sheetPlanUrl}`);
        await page.goto(sheetPlanUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Check if we're redirected to login
        if (page.url().includes('accounts.google.com') || page.url().includes('signin')) {
            console.warn('[PLAN-CAPTURE] Session Google expirée.');
            for (const tab of PLAN_TABS) {
                results[tab.airtableField] = { statut: 'SKIP', details: 'Session Google expirée' };
            }
            return results;
        }

        // Dismiss any cookie/notification banners
        try {
            for (const sel of ['#L2AGLb', "button:has-text('Tout accepter')", "button:has-text('Accept all')"]) {
                const btn = await page.$(sel);
                if (btn) { await btn.click(); await page.waitForTimeout(1000); break; }
            }
        } catch { }

        // Extract tab names and their GIDs from the sheet tabs bar
        const tabInfo = await page.evaluate(() => {
            const tabs = {};
            // Google Sheets tab buttons are in the sheet tab bar
            document.querySelectorAll('.docs-sheet-tab').forEach(tab => {
                const name = tab.querySelector('.docs-sheet-tab-name')?.textContent?.trim();
                const input = tab.querySelector('input[name="gid"]');
                const href = tab.querySelector('a')?.getAttribute('href');
                if (name) {
                    // Try to get GID from various sources
                    let gid = input?.value;
                    if (!gid && href) {
                        const match = href.match(/gid=(\d+)/);
                        if (match) gid = match[1];
                    }
                    if (!gid) {
                        const id = tab.getAttribute('id');
                        if (id) {
                            const match = id.match(/(\d+)/);
                            if (match) gid = match[1];
                        }
                    }
                    tabs[name] = gid || '0';
                }
            });
            return tabs;
        });

        console.log(`[PLAN-CAPTURE] Found tabs:`, JSON.stringify(tabInfo));

        // Base URL for the sheet (without any gid)
        const baseUrl = sheetPlanUrl.split('#')[0].split('?')[0];

        for (const tab of PLAN_TABS) {
            console.log(`[PLAN-CAPTURE] Processing tab: "${tab.tabName}"`);

            try {
                // Find the matching tab name (fuzzy match)
                let matchedTab = null;
                let matchedGid = null;

                for (const [name, gid] of Object.entries(tabInfo)) {
                    if (name.toLowerCase().includes(tab.tabName.toLowerCase().substring(0, 10)) ||
                        tab.tabName.toLowerCase().includes(name.toLowerCase().substring(0, 10))) {
                        matchedTab = name;
                        matchedGid = gid;
                        break;
                    }
                }

                if (!matchedTab) {
                    // Try clicking on the tab directly
                    try {
                        const tabEl = page.locator(`.docs-sheet-tab-name:has-text("${tab.tabName.substring(0, 15)}")`).first();
                        if (await tabEl.count() > 0) {
                            await tabEl.click();
                            await page.waitForTimeout(3000);
                            matchedTab = tab.tabName;
                        }
                    } catch { }
                }

                if (!matchedTab && !matchedGid) {
                    results[tab.airtableField] = { statut: 'SKIP', details: `Onglet "${tab.tabName}" non trouvé` };
                    console.log(`[PLAN-CAPTURE] Tab "${tab.tabName}" not found, skipping`);
                    continue;
                }

                // Navigate to the specific tab
                if (matchedGid) {
                    const tabUrl = `${baseUrl}#gid=${matchedGid}`;
                    console.log(`[PLAN-CAPTURE] Navigating to: ${tabUrl}`);
                    await page.goto(tabUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                }

                await page.waitForTimeout(4000);

                // Hide Google Sheets UI elements for a cleaner capture
                await page.evaluate(() => {
                    // Hide toolbar, formula bar, status bar, etc.
                    const hide = [
                        '#docs-menubars', '#docs-toolbar', '#formula-bar-ctrls',
                        '.docs-additions-ctrls', '#docs-branding', '#docs-notice',
                        '#secondary-actions', '#docs-titlebar-container',
                        '.waffle-status-bar', '#footer', '.docs-explore-ctrls',
                        '.docs-sheet-tab-bar'
                    ];
                    hide.forEach(sel => {
                        document.querySelectorAll(sel).forEach(el => el.style.display = 'none');
                    });
                });

                await page.waitForTimeout(1000);

                // Take screenshot
                const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
                const tmpPath = path.join(tmpDir, `temp_plan_${tab.airtableField.replace(/[^a-zA-Z0-9]/g, '_')}_${uuidv4()}.png`);
                await page.screenshot({ path: tmpPath, fullPage: false });

                // AI crop to keep only the data table
                const prompt = `Cette image montre une feuille Google Sheets avec un tableau de données.
Rogne pour ne garder que le tableau et ses données, sans les menus, barres d'outils, ou marges blanches.
Le résultat doit être utilisable directement dans une slide PowerPoint.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

                const croppedPath = await cropWithAI(tmpPath, prompt);
                const uploaded = await uploadToCloudinary(croppedPath, `audit-results/plan-${auditId}`);
                if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
                if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

                results[tab.airtableField] = {
                    statut: 'SUCCESS',
                    capture: uploaded?.secure_url || uploaded?.url || uploaded
                };
                console.log(`[PLAN-CAPTURE] ✅ ${tab.airtableField} captured`);

            } catch (e) {
                console.error(`[PLAN-CAPTURE] Error on "${tab.tabName}":`, e.message);
                results[tab.airtableField] = { statut: 'FAILED', details: e.message };
            }
        }

    } catch (e) {
        console.error('[PLAN-CAPTURE] Global error:', e.message);
        for (const tab of PLAN_TABS) {
            if (!results[tab.airtableField]) {
                results[tab.airtableField] = { statut: 'FAILED', details: e.message };
            }
        }
    } finally {
        await browser.close();
    }

    return results;
}
