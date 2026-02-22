import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function testUpdate() {
    console.log('--- TESTING AIRTABLE ATTACHMENT UPDATE ---');
    try {
        // Find the Novek AI record again
        const records = await table.select({
            filterByFormula: 'SEARCH("novek AI", {Nom de site})'
        }).all();

        if (records.length === 0) {
            console.log('Record not found.');
            return;
        }

        const recordId = records[0].id;
        const testUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

        console.log('Trying update with array of objects (for Attachment fields)...');
        try {
            await table.update(recordId, {
                "Img_Logo": [{ url: testUrl }]
            });
            console.log('Update SUCCESS (Array/Attachment format)');
        } catch (e1) {
            console.log('Update FAILED (Array format):', e1.message);

            console.log('Trying update with simple string...');
            try {
                await table.update(recordId, {
                    "Img_Logo": testUrl
                });
                console.log('Update SUCCESS (String format)');
            } catch (e2) {
                console.log('Update FAILED (String format):', e2.message);
            }
        }

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

testUpdate();
