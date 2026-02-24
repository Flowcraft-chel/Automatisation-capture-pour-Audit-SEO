import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function listFields() {
    try {
        console.log('Fetching first 3 records to see all field names...');
        const records = await table.select({ maxRecords: 3 }).all();
        const allFields = new Set();
        records.forEach(r => {
            Object.keys(r.fields).forEach(f => allFields.add(f));
        });
        console.log('--- ALL DETECTED FIELDS ---');
        console.log(Array.from(allFields).join('\n'));
    } catch (err) {
        console.error('Error:', err.message);
    }
}

listFields();
