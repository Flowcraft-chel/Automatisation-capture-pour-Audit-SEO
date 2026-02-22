import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';

async function check() {
    console.log('--- checking failed jobs ---');
    try {
        const failed = await auditQueue.getFailed();
        if (failed.length > 0) {
            console.log('Last failed job:', {
                id: failed[0].id,
                data: failed[0].data,
                failedReason: failed[0].failedReason,
                stacktrace: failed[0].stacktrace
            });
        } else {
            console.log('No failed jobs found.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

check();
