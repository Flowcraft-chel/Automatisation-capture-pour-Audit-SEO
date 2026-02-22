import 'dotenv/config';
import { initDb } from '../server/db.js';

async function check() {
    console.log('--- checking sqlite audits ---');
    try {
        const db = await initDb();
        const audits = await db.all('SELECT id, nom_site, statut_global, created_at FROM audits ORDER BY created_at DESC LIMIT 5');
        console.log('Recent Audits:', JSON.stringify(audits, null, 2));

        if (audits.length > 0) {
            const steps = await db.all('SELECT step_key, statut, resultat FROM audit_steps WHERE audit_id = ?', [audits[0].id]);
            console.log(`Steps for ${audits[0].id}:`, JSON.stringify(steps, null, 2));
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

check();
