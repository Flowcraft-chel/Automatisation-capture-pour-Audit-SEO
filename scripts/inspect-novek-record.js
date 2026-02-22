import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function inspect() {
    console.log('--- INSPECTING NOVEK AI RECORD ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        if (records.length > 0) {
            console.log('Found Record ID:', records[0].id);
            console.log('Current Status:', records[0].get('Statut'));
            console.log('All Fields:', JSON.stringify(records[0].fields, null, 2));
        } else {
            console.log('Novek AI record not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

inspect();
