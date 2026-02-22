import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function inspectNovek() {
    console.log('--- INSPECTING NOVEK AI RECORD ---');
    try {
        const record = await table.find('recQjInA9XfFjlytF');
        console.log('Field names and values:');
        console.log(JSON.stringify(record.fields, null, 2));

        console.log('\n--- ALL COLUMN KEYS ---');
        console.log(Object.keys(record.fields));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

inspectNovek();
