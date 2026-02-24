import 'dotenv/config';
import { analyzeImage } from '../server/utils/openai.js';

async function testPsiVision() {
    const testImage = 'temp_psi_full_mobile.png'; // Need to make sure this exists

    const prompt = `Look at the main "Performances" metric gauge (the largest circle, usually green, orange, or red with a number). What is the exact number inside that main circle? Return ONLY the number (0-100). Do not return any other text.`;

    console.log("Asking GPT-4o to read the score...");
    try {
        const scoreStr = await analyzeImage(testImage, prompt);
        console.log("Vision returned:", scoreStr);
        const score = parseInt(scoreStr, 10);
        console.log("Parsed score:", score);
    } catch (e) {
        console.error("Vision failed:", e);
    }
}
testPsiVision();
