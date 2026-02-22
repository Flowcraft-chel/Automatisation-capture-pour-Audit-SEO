import { chromium } from 'playwright';
import { encrypt } from './utils/encrypt.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_BASE_DIR = process.env.SESSIONS_BASE_DIR || path.resolve(__dirname, '..', 'sessions');

export async function captureSession(service, userId) {
    const urls = {
        google: 'https://accounts.google.com/',
        ubersuggest: 'https://app.neilpatel.com/en/login',
        mrm: 'https://myrankingmetrics.com/login'
    };

    const loginUrl = urls[service];
    if (!loginUrl) throw new Error('Service non supporté');

    const userSessionDir = path.resolve(SESSIONS_BASE_DIR, userId, `${service}_session`);
    console.log(`[SESSION] Dossier session cible: ${userSessionDir}`);

    await fs.mkdir(userSessionDir, { recursive: true });

    let context;
    try {
        console.log(`[SESSION] Tentative de lancement Chromium pour ${service}...`);

        // Ensure atomic launch
        context = await chromium.launchPersistentContext(userSessionDir, {
            headless: false,
            viewport: { width: 1280, height: 720 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--start-maximized'
            ],
            ignoreDefaultArgs: ['--enable-automation'],
            acceptDownloads: true
        });

        console.log(`[SESSION] Navigateur lancé.`);

        const page = await context.newPage();
        console.log(`[SESSION] Navigation vers ${loginUrl}...`);

        await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`[SESSION] Page chargée.`);

        console.log(`[SESSION] En attente de détection de connexion pour ${service}...`);

        if (service === 'google') {
            // Google specific wait: either redirect to myaccount or search or just any page after login
            await page.waitForURL(url => {
                const s = url.toString();
                return s.includes('myaccount.google.com') || s.includes('google.com/search') || s.includes('mail.google.com') || s.includes('drive.google.com');
            }, { timeout: 300000 });
        } else if (service === 'ubersuggest') {
            await page.waitForURL(url => url.includes('/dashboard'), { timeout: 300000 });
        } else {
            await page.waitForURL(url => !url.includes('login'), { timeout: 300000 });
        }

        console.log(`[SESSION] Connexion détectée ! Finalisation...`);
        await page.waitForTimeout(3000); // Give it time to settle cookies

        const cookies = await context.cookies();
        const encryptedCookies = encrypt(JSON.stringify(cookies));

        console.log(`[SESSION] SUCCESS: Cookies capturés pour ${service}`);

        await context.close();
        return { service, status: 'connected', encryptedCookies };

    } catch (err) {
        console.error(`[SESSION] CRITICAL ERROR:`, err);
        if (context) {
            try { await context.close(); } catch (e) { }
        }
        throw new Error(`Échec de la capture: ${err.message}`);
    }
}
