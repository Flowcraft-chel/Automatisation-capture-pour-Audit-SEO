import Airtable from 'airtable';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function checkAirtableFields() {
    console.log('--- CHECKING AIRTABLE FIELDS ---');
    try {
        const records = await table.select({ maxRecords: 1 }).firstPage();
        if (records.length > 0) {
            console.log('Sample record fields:', JSON.stringify(records[0].fields, null, 2));
        } else {
            console.log('No records found to inspect.');
        }
    } catch (e) {
        console.error('Error fetching Airtable record:', e.message);
    }
}

checkAirtableFields();
