import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function verify() {
    console.log('--- FINAL VERIFICATION: NOVEK AI AIRTABLE SYNC ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        if (records.length > 0) {
            const r = records[0];
            const checkFields = ['robot', 'sitemaps', 'Img_Robots_Txt', 'Sitemap', 'Img_Logo', 'Statut'];

            checkFields.forEach(f => {
                const val = r.get(f);
                console.log(`${f}:`, val ? (Array.isArray(val) ? `[Attachment: ${val[0].url}]` : val) : 'EMPTY');
            });
        } else {
            console.log('Novek AI record not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

verify();
