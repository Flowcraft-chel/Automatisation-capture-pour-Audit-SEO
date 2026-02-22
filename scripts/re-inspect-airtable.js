import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function dump() {
    console.log('--- RE-INSPECTING ALL FIELDS FOR NOVEK AI ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        console.log('Found', records.length, 'records.');
        records.forEach((r, i) => {
            console.log(`\nRECORD ${i + 1} (ID: ${r.id})`);
            console.log('Statut:', r.get('Statut'));
            console.log('Img_Logo:', JSON.stringify(r.get('Img_Logo')));
            console.log('Img_Robots_Txt:', JSON.stringify(r.get('Img_Robots_Txt')));
            console.log('Sitemap:', JSON.stringify(r.get('Sitemap')));
            console.log('robot:', r.get('robot'));
            console.log('sitemaps:', r.get('sitemaps'));

            console.log('\n--- Full Raw Fields ---');
            console.log(JSON.stringify(r.fields, null, 2));
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

dump();
