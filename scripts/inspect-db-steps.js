import 'dotenv/config';
import { initDb } from '../server/db.js';

async function inspect() {
    console.log('--- DB INSPECTION: NOVEK AI STEPS ---');
    try {
        const db = await initDb();
        const audit = await db.get('SELECT id FROM audits WHERE nom_site LIKE "%novek AI%" ORDER BY created_at DESC LIMIT 1');

        if (audit) {
            const steps = await db.all('SELECT step_key, statut, output_cloudinary_url FROM audit_steps WHERE audit_id = ?', [audit.id]);
            steps.forEach(s => {
                console.log(`[${s.step_key}] Statut: ${s.statut} | Cloudinary: ${s.output_cloudinary_url ? s.output_cloudinary_url.substring(0, 50) + '...' : 'NONE'}`);
            });
        } else {
            console.log('Audit not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

inspect();
