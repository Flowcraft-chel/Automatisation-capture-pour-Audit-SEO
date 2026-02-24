import Airtable from 'airtable';
import 'dotenv/config';

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

async function checkDetail(recordId) {
    try {
        const record = await base(process.env.AIRTABLE_TABLE_ID).find(recordId);
        console.log(`--- DETAIL FOR ${record.get('Nom de site')} ---`);
        console.log(`Status: ${record.get('Statut')}`);
        console.log(`Logo: ${record.get('Img_Logo') ? 'OK' : 'EMPTY'}`);
        console.log(`SSL: ${record.get('Img_SSL') ? 'OK' : 'EMPTY'}`);
        console.log(`Responsive: ${record.get('Img_AmIResponsive') ? 'OK' : 'EMPTY'}`);
        console.log(`PSI Mobile: ${record.get('Img_PSI_Mobile') ? 'OK' : 'EMPTY'}`);
        console.log(`PSI Desktop: ${record.get('Img_PSI_Desktop') ? 'OK' : 'EMPTY'}`);
        console.log(`Robots: ${record.get('Img_Robots_Txt') ? 'OK' : 'EMPTY'}`);
        console.log(`Sitemap: ${record.get('Img_Sitemap') ? 'OK' : 'EMPTY'}`);

        if (record.get('Img_AmIResponsive')) console.log(`Responsive URL: ${record.get('Img_AmIResponsive')}`);
        if (record.get('Img_PSI_Mobile')) console.log(`PSI Mobile URL: ${record.get('Img_PSI_Mobile')}`);
    } catch (e) {
        console.error('Error fetching record:', e.message);
    }
}

checkDetail('recy1keqnWONV0Yvt');
