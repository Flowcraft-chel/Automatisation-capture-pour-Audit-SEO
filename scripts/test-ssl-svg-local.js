import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { uploadToCloudinary } from '../server/utils/cloudinary.js';

async function testSslSvgLocal() {
    const domain = '1440horizons.fr';
    const ipAddress = '34.149.87.45';
    const bestGrade = 'A';
    const auditId = 'LOCAL-TEST-' + Date.now();

    const scores = { cert: 100, proto: 100, key: 90, cipher: 90 };
    let color = '#5cb85c';

    console.log(`[MODULE-SSL] Building SVG for ${domain}...`);

    const svgContent = `
    <svg width="800" height="380" xmlns="http://www.w3.org/2000/svg">
        <style>
            .bg { fill: #ffffff; }
            .text { font-family: Arial, sans-serif; fill: #000000; }
            .border { stroke: #cccccc; stroke-width: 1; fill: none; }
            .header-bg { fill: #f5f5f5; }
            .header-line { stroke: #cccccc; stroke-width: 1; }
            .grade-box { fill: ${color}; rx: 8; ry: 8; }
            .grade-text { font-family: Arial, sans-serif; font-size: 90px; font-weight: bold; fill: #ffffff; text-anchor: middle; dominant-baseline: central; }
            .bar-fg { fill: ${color}; }
            .bar-label { font-family: Arial, sans-serif; font-size: 13px; fill: #000000; font-weight: bold; text-anchor: end; }
            .axis-label { font-family: Arial, sans-serif; font-size: 11px; fill: #999999; text-anchor: middle; }
            .grid-line { stroke: #cccccc; stroke-width: 1; }
            .overall-rating { font-family: Arial, sans-serif; font-size: 14px; fill: #555555; text-anchor: middle; }
        </style>
        
        <rect width="100%" height="100%" class="bg" />
        
        <!-- Main Box -->
        <rect x="20" y="20" width="760" height="340" class="border" />
        
        <!-- Header -->
        <rect x="20" y="20" width="760" height="50" class="header-bg" />
        <line x1="20" y1="70" x2="780" y2="70" class="header-line" />
        <text x="40" y="52" class="text" font-size="22" font-weight="bold" fill="#333333">SSL Report: ${domain} <tspan fill="#666666" font-size="16">(${ipAddress})</tspan></text>
        
        <!-- Grade section -->
        <text x="210" y="115" class="overall-rating">Overall Rating</text>
        <rect x="130" y="130" width="160" height="160" class="grade-box" />
        <text x="210" y="215" class="grade-text">${bestGrade}</text>
        
        <!-- Axis grid -->
        <line x1="450" y1="120" x2="450" y2="290" class="grid-line" />
        <line x1="512.5" y1="120" x2="512.5" y2="290" class="grid-line" />
        <line x1="575" y1="120" x2="575" y2="290" class="grid-line" />
        <line x1="637.5" y1="120" x2="637.5" y2="290" class="grid-line" />
        <line x1="700" y1="120" x2="700" y2="290" class="grid-line" />
        <line x1="762.5" y1="120" x2="762.5" y2="290" class="grid-line" />
        
        <text x="450" y="310" class="axis-label">0</text>
        <text x="512.5" y="310" class="axis-label">20</text>
        <text x="575" y="310" class="axis-label">40</text>
        <text x="637.5" y="310" class="axis-label">60</text>
        <text x="700" y="310" class="axis-label">80</text>
        <text x="762.5" y="310" class="axis-label">100</text>

        <!-- Bars -->
        <text x="430" y="145" class="bar-label">Certificate</text>
        <rect x="450" y="130" width="${(scores.cert / 100) * 312.5}" height="22" class="bar-fg" />

        <text x="430" y="185" class="bar-label">Protocol Support</text>
        <rect x="450" y="170" width="${(scores.proto / 100) * 312.5}" height="22" class="bar-fg" />

        <text x="430" y="225" class="bar-label">Key Exchange</text>
        <rect x="450" y="210" width="${(scores.key / 100) * 312.5}" height="22" class="bar-fg" />

        <text x="430" y="265" class="bar-label">Cipher Strength</text>
        <rect x="450" y="250" width="${(scores.cipher / 100) * 312.5}" height="22" class="bar-fg" />
    </svg>
    `;

    const imagePath = path.resolve(`temp_ssl_local_${uuidv4()}.png`);

    console.log(`[MODULE-SSL] Saving summary image to ${imagePath}...`);
    await sharp(Buffer.from(svgContent)).png().toFile(imagePath);

    console.log('[MODULE-SSL] Uploading summary to Cloudinary...');
    const cloudRes = await uploadToCloudinary(imagePath, `audit-results/ssl-${auditId}`);

    console.log(`[MODULE-SSL] LOCAL TEST SUCCESS:`, cloudRes);
    if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
}

testSslSvgLocal();
