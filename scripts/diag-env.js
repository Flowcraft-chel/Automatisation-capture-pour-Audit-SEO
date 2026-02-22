import fs from 'fs';
import 'dotenv/config';

console.log('--- ENV DIAGNOSTIC ---');
console.log('CWD:', process.cwd());
console.log('.env exists:', fs.existsSync('.env'));
if (fs.existsSync('.env')) {
    const raw = fs.readFileSync('.env', 'utf8');
    console.log('.env size:', raw.length);
    console.log('.env first 50 chars:', raw.substring(0, 50).replace(/\n/g, '\\n'));
}

console.log('CLOUDINARY_CLOUD_NAME:', process.env.CLOUDINARY_CLOUD_NAME || 'UNDEFINED');
console.log('CLOUDINARY_API_KEY:', process.env.CLOUDINARY_API_KEY ? 'FOUND' : 'MISSING');
console.log('----------------------');
