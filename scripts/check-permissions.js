import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function checkPermissions() {
    const ids = ['recQjInA9XfFjlytF', 'rec68UKBisgNYno6U'];
    const simpleUrl = 'https://www.google.com/favicon.ico';

    console.log('--- PERMISSION CHECK ---');
    for (const id of ids) {
        console.log(`\nTesting Record: ${id}`);

        // 1. Try simple URL field update
        try {
            await table.update(id, { "robot": "https://test.com" });
            console.log('  [SUCCESS] robot text field');
        } catch (e) {
            console.error('  [FAIL] robot text field:', e.message);
        }

        // 2. Try attachment field update (Simple URL)
        try {
            await table.update(id, { "Img_Logo": [{ url: simpleUrl }] });
            console.log('  [SUCCESS] Img_Logo attachment (Simple URL)');
        } catch (e) {
            console.error('  [FAIL] Img_Logo attachment (Simple URL):', e.message);
        }

        // 3. Try Img_Robots_Txt
        try {
            await table.update(id, { "Img_Robots_Txt": [{ url: simpleUrl }] });
            console.log('  [SUCCESS] Img_Robots_Txt attachment');
        } catch (e) {
            console.error('  [FAIL] Img_Robots_Txt attachment:', e.message);
        }
    }
    process.exit(0);
}

checkPermissions();
