import 'dotenv/config';
import Airtable from 'airtable';
import { v2 as cloudinary } from 'cloudinary';
import { chromium } from 'playwright';
import OpenAI from 'openai';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const log = (msg) => console.log(`[TEST] ${msg}`);
const error = (msg, err) => console.error(`[FAIL] ${msg}`, err?.message || err);

async function runTests() {
    log('Starting 7 connection tests...');

    // 1. Airtable
    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        const record = await base(process.env.AIRTABLE_TABLE_ID).create({ "Nom de site": "TEST_CONNECTION" });
        log('Test 1: Airtable - Record created');
        await base(process.env.AIRTABLE_TABLE_ID).update(record.id, { "Statut": "A faire" });
        log('Test 1: Airtable - Record updated');
        await base(process.env.AIRTABLE_TABLE_ID).destroy(record.id);
        log('Test 1: Airtable - Record deleted. Success.');
    } catch (err) {
        error('Airtable', err);
    }

    // 2. Cloudinary
    try {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        const result = await cloudinary.uploader.upload('https://via.placeholder.com/150', { public_id: 'test_connection' });
        log('Test 2: Cloudinary - Image uploaded');
        const check = await axios.get(result.secure_url);
        if (check.status === 200) log('Test 2: Cloudinary - URL verified. Success.');
    } catch (err) {
        error('Cloudinary', err);
    }

    // 3. Playwright
    try {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto('https://example.com');
        const screenshotPath = 'test_screenshot.png';
        await page.screenshot({ path: screenshotPath });
        const stats = fs.statSync(screenshotPath);
        if (stats.size > 1000) log('Test 3: Playwright - Screenshot captured. Success.');
        await browser.close();
        fs.unlinkSync(screenshotPath);
    } catch (err) {
        error('Playwright', err);
    }

    // 4. OpenAI
    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: "Say 'Success'" }],
            model: "gpt-4o",
        });
        if (completion.choices[0].message.content.includes('Success')) {
            log('Test 4: OpenAI - API responded. Success.');
        }
    } catch (err) {
        error('OpenAI', err);
    }

    // 5. BullMQ + Redis
    try {
        const redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
        const queue = new Queue('test-queue', { connection: redis });
        const worker = new Worker('test-queue', async job => {
            if (job.data.msg === 'hello') return 'world';
        }, { connection: redis });

        const job = await queue.add('test-job', { msg: 'hello' });
        const result = await job.waitUntilFinished(queue);
        if (result === 'world') log('Test 5: BullMQ/Redis - Job processed. Success.');

        await worker.close();
        await queue.close();
        await redis.quit();
    } catch (err) {
        error('BullMQ/Redis', err);
    }

    // Tests 6 & 7 require browser-based OAuth or manual setup, we'll skip for automated part but log status
    log('Test 6: Google OAuth - Requires manual flow in local environment (Auth page).');
    log('Test 7: Google Sheets - Pending OAuth Token.');

    log('Phase 0 Completion Check: Please review logs above.');
}

runTests();
