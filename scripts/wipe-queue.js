import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';

async function wipe() {
    console.log('--- wiping audit-jobs queue ---');
    try {
        await auditQueue.drain();
        await auditQueue.obliterate({ force: true });
        console.log('Queue wiped.');
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

wipe();
