import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function deepAudit() {
    console.log('--- DEEP AIRTABLE AUDIT: NOVEK AI ---');
    try {
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        console.log('Found', records.length, 'records.');

        for (const r of records) {
            console.log(`\nRECORD ID: ${r.id}`);
            console.log('Nom de site:', r.get('Nom de site'));
            console.log('Statut:', r.get('Statut'));

            // Check Img_Logo
            const logo = r.get('Img_Logo');
            console.log('Img_Logo:', logo ? (Array.isArray(logo) ? `ATTACHMENT (count: ${logo.length}, first URL: ${logo[0].url})` : `Value: ${logo}`) : 'EMPTY');

            // Check Img_Robots_Txt
            const robotsImg = r.get('Img_Robots_Txt');
            console.log('Img_Robots_Txt:', robotsImg ? (Array.isArray(robotsImg) ? `ATTACHMENT (count: ${robotsImg.length}, first URL: ${robotsImg[0].url})` : `Value: ${robotsImg}`) : 'EMPTY');

            // robot text
            console.log('robot (URL):', r.get('robot'));

            console.log('--- RAW FIELD VALUES ---');
            console.log(JSON.stringify(r.fields, null, 2));
        }
    } catch (e) {
        console.error('Audit Error:', e.message);
    }
    process.exit(0);
}

deepAudit();
