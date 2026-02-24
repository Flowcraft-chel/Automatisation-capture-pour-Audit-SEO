import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function inspectRecord(recordId) {
    try {
        console.log(`Inspecting record: ${recordId}`);
        const record = await table.find(recordId);
        console.log('--- RECORD FIELDS ---');
        console.log(JSON.stringify(record.fields, null, 2));
    } catch (err) {
        console.error('Error fetching record:', err.message);
    }
}

const recordId = 'recAzeLekBiBTrgMJ';
inspectRecord(recordId);
