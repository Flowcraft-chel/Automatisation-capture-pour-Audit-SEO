import 'dotenv/config';
import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const table = base(process.env.AIRTABLE_TABLE_ID);

async function finalCheck() {
    const recordId = 'recQjInA9XfFjlytF';
    console.log('--- EXHAUSTIVE CHECK FOR RECORD:', recordId, '---');
    try {
        const record = await table.find(recordId);
        const f = record.fields;

        console.log('Statut:', f['Statut']);
        console.log('robot:', f['robot']);
        console.log('sitemaps:', f['sitemaps']);
        console.log('Img_Robots_Txt:', f['Img_Robots_Txt'] ? 'SET (Count: ' + f['Img_Robots_Txt'].length + ')' : 'EMPTY');
        console.log('Sitemap:', f['Sitemap'] ? 'SET (Count: ' + f['Sitemap'].length + ')' : 'EMPTY');
        console.log('Img_Logo:', f['Img_Logo'] ? 'SET (Count: ' + f['Img_Logo'].length + ')' : 'EMPTY');

        if (f['Img_Robots_Txt']) console.log('Robots URL:', f['Img_Robots_Txt'][0].url);

    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
}

finalCheck();
