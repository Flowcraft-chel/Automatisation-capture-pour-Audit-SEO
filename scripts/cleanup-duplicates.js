import 'dotenv/config';
import { initDb } from '../server/db.js';

async function cleanup() {
    console.log('--- Cleaning up duplicate Novek AI audits ---');
    try {
        const db = await initDb();

        // Find all audits for novekai.agency
        const audits = await db.all('SELECT id, nom_site, created_at FROM audits WHERE url_site LIKE "%novekai.agency%" ORDER BY created_at DESC');

        if (audits.length > 1) {
            console.log(`Found ${audits.length} potential duplicates. Keeping the most recent one.`);
            const keepId = audits[0].id;
            const toDelete = audits.slice(1).map(a => a.id);

            for (const id of toDelete) {
                console.log(`Deleting audit ${id}...`);
                await db.run('DELETE FROM audit_steps WHERE audit_id = ?', [id]);
                await db.run('DELETE FROM audits WHERE id = ?', [id]);
            }
            console.log('Cleanup finished.');
        } else {
            console.log('No duplicates found for novekai.agency.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

cleanup();
