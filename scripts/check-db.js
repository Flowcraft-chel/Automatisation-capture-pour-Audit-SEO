import { initDb } from '../server/db.js';

async function checkDb() {
    try {
        const db = await initDb();
        const audits = await db.all('SELECT * FROM audits');
        console.log('Audits en base:', audits.length);
        audits.forEach(a => console.log(`- ${a.nom_site} (${a.statut_global})`));

        const sessions = await db.all('SELECT * FROM user_sessions');
        console.log('\nSessions en base:', sessions.length);
        sessions.forEach(s => console.log(`- ${s.service} (User: ${s.user_id})`));

        process.exit(0);
    } catch (err) {
        console.error('Erreur:', err);
        process.exit(1);
    }
}

checkDb();
