import 'dotenv/config';
import Airtable from 'airtable';
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';

const log = (msg) => console.log(`[TEST] ${msg}`);
const error = (msg, err) => console.error(`[FAIL] ${msg}`, err?.message || err);

async function runRefinedTests() {
    log('Starting refined connection tests...');

    // 1. Airtable
    try {
        const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
        const tableName = process.env.AIRTABLE_TABLE_ID;
        const record = await base(tableName).create({ "Nom de site": "TEST_REFINED" });
        log('Test 1: Airtable - Success');
        await base(tableName).destroy(record.id);
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
        const result = await cloudinary.uploader.upload('https://www.google.com/images/branding/googlelogo/1x/googlelogo_color_272x92dp.png', { public_id: 'test_logo' });
        log('Test 2: Cloudinary API - Success');
        const check = await axios.get(result.secure_url);
        if (check.status === 200) log('Test 2: Cloudinary URL - Success');
    } catch (err) {
        error('Cloudinary', err);
    }
}

runRefinedTests();
