import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function discoverFields() {
    console.log('--- EXHAUSTIVE FIELD DISCOVERY ---');
    try {
        const records = await table.select({ maxRecords: 100 }).all();
        console.log(`Analyzing ${records.length} records...`);

        const allFields = new Set();
        records.forEach(r => {
            Object.keys(r.fields).forEach(f => allFields.add(f));
        });

        console.log('\nALL UNIQUE FIELDS FOUND:');
        console.log(JSON.stringify(Array.from(allFields).sort(), null, 2));

        // Find a record that might have a logo or capture
        const withAttachments = records.find(r =>
            Object.keys(r.fields).some(f => f.toLowerCase().includes('logo') || f.toLowerCase().includes('robot') || f.toLowerCase().includes('sitemap'))
        );

        if (withAttachments) {
            console.log('\nFound record with visual-looking fields:', withAttachments.id);
            console.log(JSON.stringify(withAttachments.fields, null, 2));
        } else {
            console.log('\nNo records found with logo/robot/sitemap in field names.');
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

discoverFields();
