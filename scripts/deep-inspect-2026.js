import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function deepInspect() {
    console.log('--- DEEP INSPECTION OF "SuperTest 2026" ---');
    try {
        const records = await table.select({
            filterByFormula: '{Nom de site} = "SuperTest 2026"'
        }).all();

        console.log(`Found ${records.length} records.`);
        for (const r of records) {
            console.log(`\n--- RECORD: ${r.id} ---`);
            console.log('Fields:', JSON.stringify(r.fields, null, 2));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

deepInspect();
