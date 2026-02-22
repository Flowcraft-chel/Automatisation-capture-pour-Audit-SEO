import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function schemaAudit() {
    console.log('--- AIRTABLE SCHEMA AUDIT ---');
    try {
        const records = await table.select({ maxRecords: 10 }).all();
        console.log('Fields found in the first 10 records:');
        const allFields = new Set();
        records.forEach(r => {
            Object.keys(r.fields).forEach(f => allFields.add(f));
        });
        console.log(Array.from(allFields));

        // Show one record in detail
        if (records.length > 0) {
            console.log('\nSample Record Details:');
            console.log(JSON.stringify(records[0].fields, null, 2));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

schemaAudit();
