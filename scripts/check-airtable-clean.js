import Airtable from 'airtable';
import 'dotenv/config';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function checkAirtable() {
    console.log('--- CLEAN AIRTABLE CHECK ---');
    try {
        const records = await table.select({ maxRecords: 10 }).all();

        for (const r of records) {
            const name = r.get('Nom de site');
            if (!name) continue;

            console.log(`SITE: ${name} | STATUT: ${r.get('Statut')} | ID: ${r.id}`);
            console.log(`  - Logo: ${r.get('Img_Logo') ? 'Present' : 'NONE'}`);
            console.log(`  - SSL: ${r.get('Img_SSL') ? 'Present' : 'NONE'}`);
            console.log(`  - Responsive: ${r.get('Img_AmIResponsive') ? 'Present' : 'NONE'}`);
            console.log(`  - PSI Mobile: ${r.get('Img_PSI_Mobile') ? 'Present' : 'NONE'}`);
            console.log(`  - PSI Desktop: ${r.get('Img_PSI_Desktop') ? 'Present' : 'NONE'}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkAirtable();
