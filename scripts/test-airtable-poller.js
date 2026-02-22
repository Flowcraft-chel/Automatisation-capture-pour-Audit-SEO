import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.OPENAI_API_KEY ? process.env.AIRTABLE_API_KEY : 'MISSING' }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function test() {
    console.log('Testing Airtable select...');
    try {
        const records = await table.select({
            filterByFormula: 'OR({Statut} = "A faire", {Statut} = "En cours")',
            maxRecords: 10
        }).all();
        console.log(`Found ${records.length} records.`);
        records.forEach(r => {
            console.log(` - ${r.get('Nom de site')} | Statut: ${r.get('Statut')}`);
        });
    } catch (e) {
        console.error('Airtable Error:', e.message);
    }
    process.exit(0);
}

test();
