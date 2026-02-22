import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null
});

export const auditQueue = new Queue('audit-jobs', { connection });

console.log('BullMQ Queue initialized');
