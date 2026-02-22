import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function findDups() {
    console.log('--- SEARCHING FOR MULTIPLE NOVEK AI RECORDS ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        console.log('Found', records.length, 'records.');
        records.forEach(r => {
            console.log(`ID: ${r.id} | Status: ${r.get('Statut')} | robot: ${r.get('robot')} | Img_Logo: ${r.get('Img_Logo') ? 'SET' : 'EMPTY'}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

findDups();
