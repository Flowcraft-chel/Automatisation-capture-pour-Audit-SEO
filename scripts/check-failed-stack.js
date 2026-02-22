import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';

async function check() {
    try {
        const failed = await auditQueue.getFailed();
        if (failed.length > 0) {
            console.log('--- FAILED JOB DETAILS ---');
            console.log('ID:', failed[0].id);
            console.log('Reason:', failed[0].failedReason);
            console.log('Stacktrace:', failed[0].stacktrace);
        } else {
            console.log('No failed jobs.');
        }
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

check();
