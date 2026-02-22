import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function inspectFields() {
    console.log('--- INSPECTING AIRTABLE FIELDS ---');
    try {
        const records = await table.select({
            filterByFormula: '{Nom de site} = "SuperTest 2026"'
        }).all();

        if (records.length > 0) {
            const r = records[0];
            console.log('Fields found in record:');
            console.log(JSON.stringify(r.fields, null, 2));
        } else {
            console.log('Record "SuperTest 2026" not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

inspectFields();
