import Airtable from 'airtable';
import 'dotenv/config';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function testTypes() {
    const recordId = 'recx7ZI4jWFKgRIYI';
    const testUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

    const fieldsToTest = ['Img_AmIResponsive', 'Img_PSI_Mobile', 'Img_Logo'];

    for (const field of fieldsToTest) {
        console.log(`Testing field: ${field}`);
        try {
            // Attempt to update with a string URL (what we are currently doing)
            await table.update(recordId, { [field]: testUrl });
            console.log(`[PASS] ${field} accepts string URL.`);
        } catch (err) {
            console.log(`[FAIL] ${field} rejected string URL: ${err.message}`);
            if (err.message.includes('invalid') || err.message.includes('Attachment')) {
                console.log(`   -> Field ${field} expects Attachment array format [ { url: "..." } ]`);
            }
        }
    }
}

testTypes();
