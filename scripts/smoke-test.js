import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function smokeTest() {
    console.log('--- AIRTABLE SMOKE TEST ---');
    try {
        // 1. Create a dummy record
        const record = await table.create({ "Nom de site": "SmokeTest-" + Date.now() });
        const rid = record.id;
        console.log('Created Record:', rid);

        // 2. Try raw string update (User's request)
        const testUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
        console.log(`\nAttempting raw string update for Img_Logo...`);
        try {
            await table.update(rid, { "Img_Logo": testUrl });
            const r1 = await table.find(rid);
            console.log('  Confirmed in Airtable?', r1.get('Img_Logo') === testUrl ? 'YES' : 'NO');
            console.log('  Value in Airtable:', r1.get('Img_Logo'));
        } catch (e) {
            console.error('  Raw String FAILED:', e.message);
        }

        // 3. Try attachment mapping update (Old behavior)
        console.log(`\nAttempting attachment object update for Img_Logo...`);
        try {
            await table.update(rid, { "Img_Logo": [{ url: testUrl }] });
            const r2 = await table.find(rid);
            console.log('  Confirmed in Airtable?', (r2.get('Img_Logo') && r2.get('Img_Logo').length > 0) ? 'YES (as attachment)' : 'NO');
            if (r2.get('Img_Logo')) console.log('  Attachment detail:', JSON.stringify(r2.get('Img_Logo')[0].url));
        } catch (e) {
            console.error('  Attachment Object FAILED:', e.message);
        }

        // 4. Try variants
        const variants = ["Img_Sitemap", "Sitemap", "Img_Robots_Txt"];
        for (const v of variants) {
            console.log(`\nTesting field: ${v}`);
            try {
                await table.update(rid, { [v]: testUrl });
                console.log(`  [OK] ${v} accepted as string`);
            } catch (e) {
                console.log(`  [FAIL] ${v} rejected string: ${e.message}`);
            }
        }

    } catch (e) {
        console.error('Smoke Test CRASHED:', e.message);
    }
    process.exit(0);
}

smokeTest();
