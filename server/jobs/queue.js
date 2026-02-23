import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Configure IORedis with SSL if needed for Railway
const redisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
};

// Railway's Redis often requires SSL (rediss://)
if (REDIS_URL.startsWith('rediss://')) {
    redisOptions.tls = {
        rejectUnauthorized: false
    };
}

const connection = new IORedis(REDIS_URL, redisOptions);

connection.on('error', (err) => {
    console.error('[REDIS QUEUE ERROR]:', err.message);
});

export const auditQueue = new Queue('audit-jobs', {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
    }
});

console.log('BullMQ Queue initialized');
