import 'dotenv/config';
import { auditResponsive } from '../server/modules/responsive_check.js';

async function testResponsive() {
    console.log('Testing responsive check on google.com...');
    try {
        const result = await auditResponsive('https://www.google.com', 'test-id-123');
        console.log('--- RESULT ---');
        console.dir(result, { depth: null });
    } catch (e) {
        console.error('Error:', e);
    }
}

testResponsive();
