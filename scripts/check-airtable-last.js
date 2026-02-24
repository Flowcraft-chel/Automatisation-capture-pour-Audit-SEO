import Airtable from 'airtable';
import 'dotenv/config';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function checkAirtable() {
    console.log('--- CHECKING LAST 5 AIRTABLE RECORDS ---');
    try {
        const records = await table.select({
            maxRecords: 10
        }).all();

        for (const r of records) {
            console.log(`- ID: ${r.id} | Site: ${r.get('Nom de site')} | Statut: ${r.get('Statut')}`);
            console.log(`  Logo: ${r.get('Img_Logo') ? 'OK' : 'MISSING'}`);
            console.log(`  SSL: ${r.get('Img_SSL') ? 'OK' : 'MISSING'}`);
            console.log(`  AmIResp: ${r.get('Img_AmIResponsive') ? 'OK' : 'MISSING'}`);
            console.log(`  PSI Mobile: ${r.get('Img_PSI_Mobile') ? 'OK' : 'MISSING'}`);
            console.log('-----------------------------------');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkAirtable();
