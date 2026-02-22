import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';

async function check(jobId) {
    console.log(`--- checking job ${jobId} ---`);
    try {
        const job = await auditQueue.getJob(jobId);
        if (job) {
            console.log('Job state:', await job.getState());
            console.log('Failed reason:', job.failedReason);
        } else {
            console.log('Job not found');
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

const id = process.argv[2] || '2';
check(id);
