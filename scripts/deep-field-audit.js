import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function deepAudit() {
    console.log('--- DEEP FIELD AUDIT (50 RECORDS) ---');
    try {
        const records = await table.select({ maxRecords: 50 }).all();
        console.log(`Analyzing ${records.length} records...`);

        const allFields = new Set();
        records.forEach(r => {
            Object.keys(r.fields).forEach(f => allFields.add(f));
        });

        console.log('\nField Inventory:');
        console.log(JSON.stringify(Array.from(allFields).sort(), null, 2));

        // Find a record that HAS data in Sitemap or Logo
        const sampleRecord = records.find(r =>
            r.get('Sitemap') || r.get('Img_Logo') || r.get('Img_Sitemap')
        );

        if (sampleRecord) {
            console.log('\nFound record with data:', sampleRecord.id);
            console.log(JSON.stringify(sampleRecord.fields, null, 2));
        } else {
            console.log('\nNo records found with Sitemap/Logo/Capture data.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

deepAudit();
