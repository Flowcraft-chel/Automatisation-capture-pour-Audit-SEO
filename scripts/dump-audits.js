import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function dumpRecent() {
    const dbPath = path.resolve(__dirname, '..', 'database.sqlite');
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    const audits = await db.all('SELECT * FROM audits ORDER BY created_at DESC LIMIT 10');
    console.log('\n--- 10 LATEST AUDITS ---');
    for (const a of audits) {
        console.log(`- ID: ${a.id.slice(0, 8)} | Site: ${a.nom_site.padEnd(20)} | Status: ${a.statut_global.padEnd(12)} | Updated: ${a.updated_at}`);
        if (a.nom_site === 'Notion') {
            const firstStep = await db.get('SELECT * FROM audit_steps WHERE audit_id = ? AND step_key = "robots_txt"', [a.id]);
            console.log(`  [Robots Txt Status: ${firstStep?.statut}]`);
        }
    }

    await db.close();
}

dumpRecent();
