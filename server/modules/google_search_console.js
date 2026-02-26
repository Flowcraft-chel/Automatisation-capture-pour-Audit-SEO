import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';

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
        fs.unlinkSync(imagePath);
        return croppedPath;
    } catch (e) {
        console.warn(`[GSC] AI crop failed: ${e.message}`);
        return imagePath;
    }
}

// ── Create a Playwright context with Google cookies injected ─────────────────
async function launchWithCookies(cookies) {
    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: 'fr-FR'
    });
    if (cookies && cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(90000);
    return { browser, context, page };
}

// ── GOOGLE SEARCH CONSOLE — SITEMAPS ────────────────────────────────────────
export async function captureGscSitemaps(siteUrl, auditId, googleCookies) {
    const result = { statut: 'ERROR', capture: null };
    const { browser, page } = await launchWithCookies(googleCookies);
    try {
        const domain = new URL(siteUrl).hostname;
        // Navigate to GSC sitemaps tab
        const gscUrl = `https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2F${encodeURIComponent(domain)}%2F`;
        console.log(`[GSC] Navigating to Sitemaps: ${gscUrl}`);
        console.log(`[GSC] Cookies injected: ${googleCookies.length} cookies`);
        await page.goto(gscUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // Check we're logged in
        const currentUrl = page.url();
        console.log(`[GSC] Current URL after navigation: ${currentUrl}`);
        if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin')) {
            result.statut = 'SKIP';
            result.details = 'Session Google expirée ou invalide (redirigé vers login)';
            console.error(`[GSC] ❌ Session expired — redirected to: ${currentUrl}`);
            return result;
        }

        await page.waitForTimeout(6000);

        const tmpPath = path.resolve(`temp_gsc_sitemap_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Cette image est une capture de Google Search Console, onglet Sitemaps.
Rogne pour ne garder que le tableau listant les sitemaps déclarés.
Supprime le menu de navigation GSC, le header, et tout ce qui n'est pas le tableau.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const croppedPath = await cropWithAI(tmpPath, prompt);
        const uploaded = await uploadToCloudinary(croppedPath, `audit-results/gsc-sitemaps-${auditId}`);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
        if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';
    } catch (e) {
        result.details = e.message;
        console.error('[GSC] Sitemaps error:', e.message);
    } finally { await browser.close(); }
    return result;
}

// ── GOOGLE SEARCH CONSOLE — HTTPS ────────────────────────────────────────────
export async function captureGscHttps(siteUrl, auditId, googleCookies) {
    const result = { statut: 'ERROR', capture: null };
    const { browser, page } = await launchWithCookies(googleCookies);
    try {
        const domain = new URL(siteUrl).hostname;
        const gscUrl = `https://search.google.com/search-console/security-issues?resource_id=https%3A%2F%2F${encodeURIComponent(domain)}%2F`;
        console.log(`[GSC] Navigating to HTTPS: ${gscUrl}`);
        await page.goto(gscUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

        if (page.url().includes('accounts.google.com')) {
            result.statut = 'SKIP';
            result.details = 'Session Google expirée ou invalide';
            return result;
        }

        await page.waitForTimeout(4000);

        const tmpPath = path.resolve(`temp_gsc_https_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Cette image montre un rapport HTTPS de Google Search Console.
Il y a un graphe avec des couleurs, notamment une zone verte.
Rogne pour ne garder que la partie du graphe colorée en vert et son contexte immédiat.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const croppedPath = await cropWithAI(tmpPath, prompt);
        const uploaded = await uploadToCloudinary(croppedPath, `audit-results/gsc-https-${auditId}`);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
        if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';
    } catch (e) {
        result.details = e.message;
        console.error('[GSC] HTTPS error:', e.message);
    } finally { await browser.close(); }
    return result;
}

// ── GOOGLE SEARCH CONSOLE — PERFORMANCE (Traffic) ────────────────────────────
export async function captureGscPerformance(siteUrl, auditId, googleCookies) {
    const result = { statut: 'ERROR', capture1: null, capture2: null, clics: null, pagesIndexed: null };
    const { browser, page } = await launchWithCookies(googleCookies);
    try {
        const domain = new URL(siteUrl).hostname;
        // GSC Performance page
        const gscUrl = `https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2F${encodeURIComponent(domain)}%2F`;
        console.log(`[GSC] Navigating to Performance: ${gscUrl}`);
        await page.goto(gscUrl, { waitUntil: 'networkidle', timeout: 60000 });

        if (page.url().includes('accounts.google.com')) {
            result.statut = 'SKIP';
            result.details = 'Session Google expirée ou invalide';
            return result;
        }
        await page.waitForTimeout(5000);

        // Try to extract total clicks from the page
        const metrics = await page.evaluate(() => {
            const data = {};
            // Look for the summary metrics (Total Clics, Total Impressions)
            document.querySelectorAll('[class*="metric"], [class*="stat"], span, div').forEach(el => {
                const text = el.innerText?.trim();
                if (text && /^\d[\d,.KMk]*$/.test(text.replace(/\s/g, ''))) {
                    const parent = el.closest('[class*="card"], [class*="metric"]');
                    const label = parent?.querySelector('[class*="label"], [class*="title"]')?.innerText?.toLowerCase();
                    if (label?.includes('clic')) data.clics = text;
                    if (label?.includes('impression')) data.impressions = text;
                }
            });
            return data;
        });
        if (metrics.clics) result.clics = metrics.clics;
        console.log(`[GSC] Performance metrics:`, JSON.stringify(metrics));

        // Screenshot 1: Full performance graph
        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const tmpPath1 = path.join(tmpDir, `temp_gsc_perf1_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath1, fullPage: false });

        const prompt1 = `Cette image est Google Search Console, page Performance.
Rogne pour ne garder que le graphe de performance (courbe des clics/impressions) et les métriques résumées en haut.
Supprime le menu latéral GSC et tout le texte sous le graphe.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const cropped1 = await cropWithAI(tmpPath1, prompt1);
        const up1 = await uploadToCloudinary(cropped1, `audit-results/gsc-perf1-${auditId}`);
        if (fs.existsSync(cropped1)) fs.unlinkSync(cropped1);
        if (fs.existsSync(tmpPath1) && tmpPath1 !== cropped1) fs.unlinkSync(tmpPath1);
        result.capture1 = up1?.secure_url || up1?.url || up1;

        // Scroll down for the table
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(2000);

        const tmpPath2 = path.join(tmpDir, `temp_gsc_perf2_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath2, fullPage: false });

        const prompt2 = `Cette image montre le tableau de données de Google Search Console.
Rogne pour ne garder que le tableau des requêtes/pages (les lignes de données avec clics et impressions).
Supprime le graphe, le menu latéral, et les filtres.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const cropped2 = await cropWithAI(tmpPath2, prompt2);
        const up2 = await uploadToCloudinary(cropped2, `audit-results/gsc-perf2-${auditId}`);
        if (fs.existsSync(cropped2)) fs.unlinkSync(cropped2);
        if (fs.existsSync(tmpPath2) && tmpPath2 !== cropped2) fs.unlinkSync(tmpPath2);
        result.capture2 = up2?.secure_url || up2?.url || up2;

        result.statut = 'SUCCESS';
    } catch (e) {
        result.details = e.message;
        console.error('[GSC] Performance error:', e.message);
    } finally { await browser.close(); }
    return result;
}

// ── GOOGLE SEARCH CONSOLE — COVERAGE (Pages Indexed) ────────────────────────
export async function captureGscCoverage(siteUrl, auditId, googleCookies) {
    const result = { statut: 'ERROR', capture: null, pagesIndexed: null };
    const { browser, page } = await launchWithCookies(googleCookies);
    try {
        const domain = new URL(siteUrl).hostname;
        const gscUrl = `https://search.google.com/search-console/index?resource_id=https%3A%2F%2F${encodeURIComponent(domain)}%2F`;
        console.log(`[GSC] Navigating to Coverage (Index): ${gscUrl}`);
        await page.goto(gscUrl, { waitUntil: 'networkidle', timeout: 60000 });

        if (page.url().includes('accounts.google.com')) {
            result.statut = 'SKIP';
            result.details = 'Session Google expirée';
            return result;
        }
        await page.waitForTimeout(5000);

        // Try to extract indexed pages count
        const indexed = await page.evaluate(() => {
            const elements = document.querySelectorAll('[class*="metric"], [class*="count"], span, div');
            for (const el of elements) {
                const text = el.innerText?.trim();
                // Look for a number near "Valid" or "Indexées" labels
                if (text && /^\d[\d,.]*$/.test(text.replace(/\s/g, ''))) {
                    const container = el.closest('[class*="card"]');
                    const label = container?.innerText?.toLowerCase();
                    if (label?.includes('valid') || label?.includes('indexé') || label?.includes('indexed')) {
                        return text;
                    }
                }
            }
            return null;
        });
        if (indexed) result.pagesIndexed = indexed;
        console.log(`[GSC] Pages indexed: ${indexed || 'N/A'}`);

        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const tmpPath = path.join(tmpDir, `temp_gsc_coverage_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Cette image montre Google Search Console, page Couverture/Index.
Rogne pour ne garder que le graphe de couverture (barres vertes/rouges montrant les pages indexées) et les chiffres résumés.
Supprime le menu latéral GSC et les détails sous le graphe.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const croppedPath = await cropWithAI(tmpPath, prompt);
        const uploaded = await uploadToCloudinary(croppedPath, `audit-results/gsc-coverage-${auditId}`);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
        if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';
    } catch (e) {
        result.details = e.message;
        console.error('[GSC] Coverage error:', e.message);
    } finally { await browser.close(); }
    return result;
}

// ── GOOGLE SEARCH CONSOLE — TOP PAGES (Meilleures pages) ───────────────────
export async function captureGscTopPages(siteUrl, auditId, googleCookies) {
    const result = { statut: 'ERROR', capture: null };
    const { browser, page } = await launchWithCookies(googleCookies);
    try {
        const domain = new URL(siteUrl).hostname;
        // Performance page sorted by pages tab
        const gscUrl = `https://search.google.com/search-console/performance/search-analytics?resource_id=https%3A%2F%2F${encodeURIComponent(domain)}%2F&breakdown=page`;
        console.log(`[GSC] Navigating to Top Pages: ${gscUrl}`);
        await page.goto(gscUrl, { waitUntil: 'networkidle', timeout: 60000 });

        if (page.url().includes('accounts.google.com')) {
            result.statut = 'SKIP';
            result.details = 'Session Google expirée';
            return result;
        }
        await page.waitForTimeout(5000);

        // Click on "Pages" tab if visible
        try {
            const pagesTab = page.locator('text=Pages').first();
            if (await pagesTab.count() > 0) await pagesTab.click();
            await page.waitForTimeout(3000);
        } catch { }

        // Scroll to the table
        await page.evaluate(() => window.scrollBy(0, 400));
        await page.waitForTimeout(2000);

        const tmpDir = process.env.RAILWAY_ENVIRONMENT ? '/tmp' : '.';
        const tmpPath = path.join(tmpDir, `temp_gsc_pages_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Cette image montre Google Search Console, onglet Pages.
Rogne pour ne garder que le tableau des meilleures pages (URLs avec clics et impressions).
Supprime le graphe au-dessus, le menu latéral, et les onglets.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const croppedPath = await cropWithAI(tmpPath, prompt);
        const uploaded = await uploadToCloudinary(croppedPath, `audit-results/gsc-top-pages-${auditId}`);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
        if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';
    } catch (e) {
        result.details = e.message;
        console.error('[GSC] Top Pages error:', e.message);
    } finally { await browser.close(); }
    return result;
}
