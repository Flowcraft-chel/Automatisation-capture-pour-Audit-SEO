import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function listNovek() {
    console.log('--- LISTING ALL "NOVEK" RECORDS ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek", {Nom de site})'
        }).all();

        console.log('Found', records.length, 'records.');
        records.forEach(r => {
            console.log(`ID: ${r.id} | Name: ${r.get('Nom de site')} | Statut: ${r.get('Statut')}`);
            console.log(`  Img_Logo: ${r.get('Img_Logo') ? 'SET' : 'EMPTY'}`);
            console.log(`  Img_Robots_Txt: ${r.get('Img_Robots_Txt') ? 'SET' : 'EMPTY'}`);
            console.log('---');
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

listNovek();
