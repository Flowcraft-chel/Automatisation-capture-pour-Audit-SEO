import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function checkStatus() {
    const dbPath = path.resolve(__dirname, '..', 'database.sqlite');
    console.log(`Checking DB at: ${dbPath}`);

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const latestAudit = await db.get('SELECT * FROM audits ORDER BY created_at DESC LIMIT 1');
    if (!latestAudit) {
        console.log('No audits found.');
        await db.close();
        return;
    }

    console.log('\n--- LATEST AUDIT ---');
    console.log(`ID: ${latestAudit.id}`);
    console.log(`Site: ${latestAudit.nom_site}`);
    console.log(`Global Status: ${latestAudit.statut_global}`);
    console.log(`Updated At: ${latestAudit.updated_at}`);

    const steps = await db.all('SELECT * FROM audit_steps WHERE audit_id = ? ORDER BY step_key', [latestAudit.id]);
    console.log('\n--- STEPS ---');
    steps.forEach(s => {
        console.log(`- ${s.step_key.padEnd(20)}: ${s.statut.padEnd(15)} (Updated: ${s.updated_at})`);
        if (s.output_cloudinary_url) {
            console.log(`  Capture: ${s.output_cloudinary_url}`);
        }
    });

    await db.close();
}

checkStatus();
