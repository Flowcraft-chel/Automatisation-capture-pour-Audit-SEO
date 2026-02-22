import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function verifyFinalString() {
    console.log('--- VERIFYING RAW URL STORAGE ---');
    try {
        const records = await table.select({
            filterByFormula: '{Nom de site} = "SuperTest 2026"'
        }).all();

        if (records.length > 0) {
            const r = records[0];
            console.log(`Record ID: ${r.id}`);
            console.log(`Nom de site: ${r.get('Nom de site')}`);
            console.log(`Img_Logo: ${r.get('Img_Logo')}`);
            console.log(`Img_Robots_Txt: ${r.get('Img_Robots_Txt')}`);
            console.log(`Statut: ${r.get('Statut')}`);
        } else {
            console.log('Record "SuperTest 2026" not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

verifyFinalString();
