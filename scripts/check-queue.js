import 'dotenv/config';
import { auditQueue } from '../server/jobs/queue.js';

async function check() {
    console.log('--- checking audit-jobs queue ---');
    try {
        const waiting = await auditQueue.getWaitingCount();
        const active = await auditQueue.getActiveCount();
        const completed = await auditQueue.getCompletedCount();
        const failed = await auditQueue.getFailedCount();
        const delayed = await auditQueue.getDelayedCount();

        console.log(`Waiting: ${waiting}`);
        console.log(`Active: ${active}`);
        console.log(`Completed: ${completed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Delayed: ${delayed}`);

        const jobs = await auditQueue.getWaiting();
        if (jobs.length > 0) {
            console.log('Sample waiting job:', jobs[0].id, jobs[0].data);
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        process.exit(0);
    }
}

check();
