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
        await page.goto(gscUrl, { waitUntil: 'networkidle', timeout: 60000 });

        // Check we're logged in
        if (page.url().includes('accounts.google.com')) {
            result.statut = 'SKIP';
            result.details = 'Session Google expirée ou invalide';
            return result;
        }

        await page.waitForTimeout(4000);

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
        await page.goto(gscUrl, { waitUntil: 'networkidle', timeout: 60000 });

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
