import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function inspect() {
    console.log('--- DETAILED FIELD INSPECTION ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        if (records.length > 0) {
            const fields = Object.keys(records[0].fields);
            console.log('Total fields:', fields.length);
            console.log('Search for "Sitemap" (case sensitive):', fields.find(f => f === 'Sitemap'));
            console.log('Search for "sitemaps" (case sensitive):', fields.find(f => f === 'sitemaps'));
            console.log('Search for "robot" (case sensitive):', fields.find(f => f === 'robot'));
            console.log('Search for "Img_Robots_Txt" (case sensitive):', fields.find(f => f === 'Img_Robots_Txt'));

            console.log('\nAll Field Names:');
            fields.sort().forEach(f => console.log(`- ${f}`));
        } else {
            console.log('Novek AI record not found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

inspect();
