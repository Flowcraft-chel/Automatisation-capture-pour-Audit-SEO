import 'dotenv/config';
import { updateAirtableField, updateAirtableStatut } from '../server/airtable.js';

async function test() {
    const recordId = 'recQjInA9XfFjlytF';
    console.log('--- MANUAL ATTACHMENT TEST FOR:', recordId, '---');

    const fakeLogo = 'https://res.cloudinary.com/drxkpv8m6/image/upload/v1740062402/audit-results/logo-gg-test.png';
    const fakeCapture = 'https://res.cloudinary.com/drxkpv8m6/image/upload/v1740062402/audit-captures/robots-test.png';

    console.log('Setting Img_Logo...');
    await updateAirtableField(recordId, 'Img_Logo', fakeLogo);

    console.log('Setting Img_Robots_Txt...');
    await updateAirtableField(recordId, 'Img_Robots_Txt', fakeCapture);

    console.log('Setting Statut to fait...');
    await updateAirtableStatut(recordId, 'fait');

    console.log('DONE. Check Airtable now.');
    process.exit(0);
}

test();
