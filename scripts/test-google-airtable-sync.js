import 'dotenv/config';
import { initDb } from '../server/db.js';
import { auditRobotsSitemap } from '../server/modules/robots_sitemap.js';
import { extractLogo } from '../server/modules/logo_extraction.js';
import { createAirtableAudit, updateAirtableField, updateAirtableStatut } from '../server/airtable.js';
import { v4 as uuidv4 } from 'uuid';

async function testGoogleAirtableSync() {
    console.log('--- STARTING DIRECT GOOGLE.COM AUDIT WITH AIRTABLE SYNC ---');
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

        console.log(`[SYNC-TEST] Internal Audit ID: ${auditId}`);

        // 2. Create Airtable Record
        console.log('[SYNC-TEST] Creating Airtable record...');
        const airtableId = await createAirtableAudit({
            siteName: 'Google Sync Test (Direct)',
            siteUrl: 'https://www.google.com',
            auditSheetUrl: 'https://docs.google.com/spreadsheets/d/test-audit',
            actionPlanSheetUrl: 'https://docs.google.com/spreadsheets/d/test-plan',
            mrmReportUrl: 'https://mrm.com/test'
        });
        console.log(`[SYNC-TEST] Airtable Record ID: ${airtableId}`);

        // 3. Setup Local DB entries
        await db.run(
            'INSERT INTO audits (id, user_id, nom_site, url_site, airtable_record_id, statut_global) VALUES (?, ?, ?, ?, ?, ?)',
            [auditId, userId, 'Google Sync Test', 'https://www.google.com', airtableId, 'EN_COURS']
        );

        const steps = ['robots_txt', 'sitemap', 'logo'];
        for (const sk of steps) {
            await db.run(
                'INSERT INTO audit_steps (id, audit_id, step_key, statut) VALUES (?, ?, ?, ?)',
                [uuidv4(), auditId, sk, 'EN_ATTENTE']
            );
        }

        const notifySync = async (key, status, field = null, value = null) => {
            console.log(`[SYNC-TEST] ${key}: ${status}`);
            await db.run(
                'UPDATE audit_steps SET statut = ?, output_cloudinary_url = ?, updated_at = CURRENT_TIMESTAMP WHERE audit_id = ? AND step_key = ?',
                [status, value, auditId, key]
            );
            if (field && value) {
                console.log(`[SYNC-TEST] Syncing ${field} to Airtable...`);
                await updateAirtableField(airtableId, field, value);
            }
        };

        // 4. EXECUTE ROBOTS & SITEMAP
        await notifySync('robots_txt', 'EN_COURS');
        const robotsRes = await auditRobotsSitemap('https://www.google.com', auditId);

        await notifySync('robots_txt', robotsRes.robots_txt.statut, 'Img_Robots_Txt', robotsRes.robots_txt.capture);
        await updateAirtableField(airtableId, 'robot', robotsRes.robots_txt.url);

        await notifySync('sitemap', 'EN_COURS');
        await notifySync('sitemap', robotsRes.sitemap.statut, 'Img_Sitemap', robotsRes.sitemap.capture);

        // 5. EXECUTE LOGO
        await notifySync('logo', 'IA_EN_COURS');
        const logoRes = await extractLogo('https://www.google.com', auditId);
        await notifySync('logo', logoRes.statut, 'Img_Logo', logoRes.url);

        // 6. FINALIZE
        await db.run('UPDATE audits SET statut_global = "TERMINE" WHERE id = ?', [auditId]);
        await updateAirtableStatut(airtableId, 'fait');

        console.log('--- SYNC TEST COMPLETE ---');
        console.log(`Check Airtable Record: ${airtableId}`);
        console.log('You can also see the result in your local dashboard.');

    } catch (err) {
        console.error('[SYNC TEST ERROR]:', err);
    } finally {
        if (db) await db.close();
        process.exit(0);
    }
}

testGoogleAirtableSync();
