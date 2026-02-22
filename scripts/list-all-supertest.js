import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function listAllTests() {
    console.log('--- LISTING ALL "SuperTest 2026" RECORDS ---');
    try {
        const records = await table.select({
            filterByFormula: '{Nom de site} = "SuperTest 2026"'
        }).all();

        console.log('Found', records.length, 'records.');
        records.forEach(r => {
            console.log(`ID: ${r.id} | Name: ${r.get('Nom de site')} | Statut: ${r.get('Statut')}`);
            console.log(`  Img_Logo: ${r.get('Img_Logo') || 'EMPTY'}`);
            console.log(`  Img_Robots_Txt: ${r.get('Img_Robots_Txt') || 'EMPTY'}`);
            console.log('---');
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

listAllTests();
