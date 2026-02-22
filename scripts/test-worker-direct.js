import 'dotenv/config';
import { initDb } from '../server/db.js';
import { initWorker } from '../server/jobs/worker.js';
import { Server } from 'socket.io';
import { createServer } from 'http';

const dummyHttpServer = createServer();
const io = new Server(dummyHttpServer);

async function start() {
    console.log('--- worker direct test ---');
    try {
        const db = await initDb();
        console.log('DB initialized.');
        initWorker(io, db);
        console.log('Worker initialized.');
    } catch (e) {
        console.error('FAILED:', e);
    }
}

start();
