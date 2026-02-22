import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function inspect() {
    console.log('--- INSPECTING AIRTABLE FIELDS ---');
    try {
        const records = await table.select({ maxRecords: 1 }).all();
        if (records.length > 0) {
            console.log('Fields available in record:', Object.keys(records[0].fields));
            console.log('Sample record data:', records[0].fields);
        } else {
            console.log('No records found to inspect.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

inspect();
