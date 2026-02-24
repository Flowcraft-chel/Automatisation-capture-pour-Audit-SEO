import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../utils/cloudinary.js';
import { analyzeImage } from '../utils/openai.js';
import { decrypt } from '../utils/encrypt.js';

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
        console.warn(`[MRM] AI crop failed: ${e.message}`);
        return imagePath;
    }
}

//  MY RANKING METRICS — Profondeur des pages arh ça m'énerve c'est trop long là
export async function captureMrmProfondeur(mrmReportUrl, auditId, encryptedCookies) {
    const result = { statut: 'ERROR', capture: null };

    // Decrypter et coller les cookies
    let cookies = [];
    if (encryptedCookies) {
        try {
            cookies = JSON.parse(decrypt(encryptedCookies));
        } catch (e) {
            result.statut = 'SKIP';
            result.details = 'Cookies MRM invalides ou expirés';
            return result;
        }
    } else {
        result.statut = 'SKIP';
        result.details = 'Session MRM non configurée';
        return result;
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
        viewport: { width: 1400, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        locale: 'fr-FR'
    });
    await context.addCookies(cookies);
    const page = await context.newPage();
    page.setDefaultTimeout(90000);

    try {
        console.log(`[MRM] Navigating to: ${mrmReportUrl}`);
        await page.goto(mrmReportUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(3000);

        // Vérifier si on ets toujours connectés
        if (page.url().includes('login') || page.url().includes('signin')) {
            result.statut = 'SKIP';
            result.details = 'Session MRM expirée — reconnexion nécessaire';
            return result;
        }

        // Trouver "Profondeur des pages et maillage interne"
        const targetText = 'Profondeur des pages et maillage interne';
        try {
            const link = page.locator(`text="${targetText}"`).first();
            await link.waitFor({ state: 'visible', timeout: 15000 });
            await link.scrollIntoViewIfNeeded();
            await page.waitForTimeout(1000);
        } catch {
            // Essayer de trouver la section avec "Profondeur des pages"
            try {
                await page.locator('text=Profondeur des pages').first().scrollIntoViewIfNeeded();
            } catch {
                result.statut = 'SKIP';
                result.details = `Section "${targetText}" non trouvée`;
                return result;
            }
        }

        // Scroll pour trouver le tableau en dessous de ce titre
        await page.waitForSelector('table', { state: 'visible', timeout: 30000 });
        const tableEl = page.locator('table').first();
        await tableEl.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);

        const tmpPath = path.resolve(`temp_mrm_${uuidv4()}.png`);
        await page.screenshot({ path: tmpPath, fullPage: false });

        const prompt = `Cette image montre un tableau de données My Ranking Metrics sur la profondeur des pages.
Rogne pour ne garder que le tableau, sans aucun menu ni chrome de l'application.
CROP: x=[left], y=[top], width=[largeur], height=[hauteur]`;

        const croppedPath = await cropWithAI(tmpPath, prompt);
        const uploaded = await uploadToCloudinary(croppedPath, `audit-results/mrm-profondeur-${auditId}`);
        if (fs.existsSync(croppedPath)) fs.unlinkSync(croppedPath);
        if (fs.existsSync(tmpPath) && tmpPath !== croppedPath) fs.unlinkSync(tmpPath);

        result.capture = uploaded?.secure_url || uploaded?.url || uploaded;
        result.statut = 'SUCCESS';
    } catch (e) {
        result.details = e.message;
        console.error('[MRM] Error:', e.message);
    } finally { await browser.close(); }
    return result;
}
