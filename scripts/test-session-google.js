import 'dotenv/config';
import { captureSession } from '../server/sessions.js';
import { encrypt, decrypt } from '../server/utils/encrypt.js';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

async function testGoogleSession() {
    const userId = 'test_user_123';
    const service = 'google';

    console.log('--- TEST 6: Session Playwright Google ---');

    try {
        // 1. Capture Session (Manual Login in visible window)
        console.log('Action: Connectez-vous à votre compte Google dans la fenêtre qui va s\'ouvrir.');
        const result = await captureSession(service, userId);
        console.log('Résultat capture:', result);

        // 2. Verify cookies are encrypted
        const decryptedCookies = JSON.parse(decrypt(result.encryptedCookies));
        console.log('Cookies déchiffrés (count):', decryptedCookies.length);

        // 3. Re-launch to verify persistence
        console.log('\n--- Vérification de la re-connexion automatique ---');
        const userSessionDir = path.join(process.env.SESSIONS_BASE_DIR || './sessions', userId, `${service}_session`);

        const context = await chromium.launchPersistentContext(userSessionDir, {
            headless: true // Verify in headless for real production feel
        });

        const page = await context.newPage();
        await page.goto('https://myaccount.google.com/');

        const title = await page.title();
        console.log('Titre de la page (après re-connexion):', title);

        const isLoggedIn = await page.evaluate(() => {
            return !document.body.innerText.includes('Se connecter');
        });

        if (isLoggedIn) {
            console.log('✅ SUCCÈS: Toujours connecté à Google sans interaction !');
        } else {
            console.log('❌ ÉCHEC: La connexion a été perdue.');
        }

        await context.close();

    } catch (err) {
        console.error('❌ ERREUR pendant le test:', err);
    }
}

testGoogleSession();
