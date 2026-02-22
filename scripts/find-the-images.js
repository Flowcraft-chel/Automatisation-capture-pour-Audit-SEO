import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function findTheImages() {
    console.log('--- GLOBAL SEARCH FOR ATTACHMENTS ---');
    try {
        const records = await table.select({
            filterByFormula: 'OR({Img_Logo} != BLANK(), {Img_Robots_Txt} != BLANK())'
        }).all();

        console.log('Found', records.length, 'records with ANY image.');
        records.forEach(r => {
            console.log(`- RECORD: ${r.get('Nom de site')} (ID: ${r.id})`);
            console.log(`  Statut: ${r.get('Statut')}`);
            console.log(`  Img_Logo: ${r.get('Img_Logo') ? 'SET' : 'EMPTY'}`);
            console.log(`  Img_Robots_Txt: ${r.get('Img_Robots_Txt') ? 'SET' : 'EMPTY'}`);
            console.log('-------------------');
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

findTheImages();
