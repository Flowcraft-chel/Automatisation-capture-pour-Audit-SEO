import 'dotenv/config';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function testBullMQ() {
    console.log('--- TEST 5: BullMQ + Redis ---');
    console.log('Connexion à Redis:', REDIS_URL);

    const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

    const queue = new Queue('test-queue', { connection });
    const worker = new Worker('test-queue', async (job) => {
        console.log('Job reçu:', job.data);
        return { success: true, processedAt: new Date().toISOString() };
    }, { connection });

    worker.on('completed', (job) => {
        console.log('✅ Job terminé avec succès:', job.returnvalue);
    });

    worker.on('failed', (job, err) => {
        console.error('❌ Job échoué:', err);
    });

    try {
        console.log('Ajout d\'un job à la file...');
        await queue.add('test-job', { hello: 'world' });

        // Attendre un peu pour que le worker traite le job
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log('Nettoyage...');
        await worker.close();
        await queue.close();
        connection.disconnect();

        console.log('✅ Test terminé.');
    } catch (err) {
        console.error('❌ ERREUR fatale:', err);
    }
}

testBullMQ();
