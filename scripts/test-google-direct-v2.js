import 'dotenv/config';
import { initDb } from '../server/db.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import { v4 as uuidv4 } from 'uuid';

async function testGoogleDirect() {
    console.log('--- STARTING DIRECT GOOGLE.COM AUDIT (Redis Bypass) ---');
    let db;
    try {
        db = await initDb();

        // 1. Get a valid user
        const user = await db.get('SELECT id FROM users LIMIT 1');
        if (!user) {
            console.error('No users found. Please register a user first via UI.');
            process.exit(1);
        }
        const userId = user.id;
        const auditId = uuidv4();

        console.log(`[DIRECT] Audit ID: ${auditId}`);

        // 2. Setup DB entries
        await db.run(
            'INSERT INTO audits (id, user_id, nom_site, url_site, statut_global) VALUES (?, ?, ?, ?, ?)',
            [auditId, userId, 'Google Direct Test', 'https://www.google.com', 'EN_COURS']
        );

        const steps = ['robots_txt', 'sitemap', 'logo'];
        for (const sk of steps) {
            await db.run(
                'INSERT INTO audit_steps (id, audit_id, step_key, statut) VALUES (?, ?, ?, ?)',
                [uuidv4(), auditId, sk, 'EN_ATTENTE']
            );
        }

        const updateStep = async (key, status, result = null, cloudinaryUrl = null) => {
            console.log(`[DIRECT] Updating ${key} to ${status}...`);
            await db.run(
                'UPDATE audit_steps SET statut = ?, resultat = ?, output_cloudinary_url = ?, updated_at = CURRENT_TIMESTAMP WHERE audit_id = ? AND step_key = ?',
                [status, result, cloudinaryUrl, auditId, key]
            );
        };

        // 3. EXECUTE ROBOTS & SITEMAP
        await updateStep('robots_txt', 'EN_COURS');
        const robotsRes = await auditRobotsSitemap('https://www.google.com', auditId);

        await updateStep('robots_txt', robotsRes.robots_txt.statut, null, robotsRes.robots_txt.capture);

        await updateStep('sitemap', 'EN_COURS');
        await updateStep('sitemap', robotsRes.sitemap.statut, null, robotsRes.sitemap.capture);

        // 4. EXECUTE LOGO
        await updateStep('logo', 'IA_EN_COURS');
        const logoRes = await extractLogo('https://www.google.com', auditId);
        await updateStep('logo', logoRes.statut, logoRes.details, logoRes.url);

        // 5. FINALIZE
        await db.run('UPDATE audits SET statut_global = "TERMINE" WHERE id = ?', [auditId]);
        console.log('--- DIRECT TEST COMPLETE ---');
        console.log('You can now see the result in the "Progression" tab of your local app.');

    } catch (err) {
        console.error('[DIRECT ERROR]:', err);
    } finally {
        if (db) await db.close();
        process.exit(0);
    }
}

testGoogleDirect();
