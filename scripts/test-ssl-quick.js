import 'dotenv/config';
import { auditSslLabs } from '../server/modules/ssl_labs.js';

async function test() {
    console.log("Testing SSL v4 on notion.so...");
    const res = await auditSslLabs('notion.so', 'test-ssl-final');
    console.log("Result:", res);
}
test();
