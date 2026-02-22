import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function checkAll() {
    console.log('--- EXHAUSTIVE FIELD DUMP ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        console.log('Found', records.length, 'records.');
        records.forEach((r, i) => {
            console.log(`\n--- RECORD ${i + 1} (ID: ${r.id}) ---`);
            const fields = r.fields;
            Object.keys(fields).forEach(fname => {
                const val = fields[fname];
                if (Array.isArray(val) && val[0]?.url) {
                    console.log(`${fname}: [ATTACHMENT: ${val[0].url.substring(0, 50)}...]`);
                } else {
                    console.log(`${fname}: ${val}`);
                }
            });
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

checkAll();
