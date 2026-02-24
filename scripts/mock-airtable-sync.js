import 'dotenv/config';
import { updateAirtableField, updateAirtableStatut } from '../server/airtable.js';

async function mockSync() {
    const recordId = 'recFR2HQQ88J2fDba'; // The one just created for Notion
    console.log(`--- MOCK SYNC START for ${recordId} ---`);

    const dummyUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

    try {
        await updateAirtableField(recordId, 'Img_Ssl_Labs', dummyUrl);
        await updateAirtableField(recordId, 'Img_Responsive', dummyUrl);
        await updateAirtableField(recordId, 'Img_PageSpeed_Mobile', dummyUrl);
        await updateAirtableField(recordId, 'Img_PageSpeed_Desktop', dummyUrl);
        await updateAirtableField(recordId, 'mobilescore', '99');
        await updateAirtableField(recordId, 'desktopscore', '100');

        await updateAirtableStatut(recordId, 'fait');
        console.log('--- MOCK SYNC SUCCESS ---');
    } catch (e) {
        console.error('Mock sync failed:', e.message);
    }
}

mockSync();
