import 'dotenv/config';
import { analyzeImage } from '../server/utils/openai.js';

async function testPsiVisionRaw() {
    const testImage = 'temp_psi_full_mobile.png'; // Need to make sure this exists

    const cropPrompt = `
    TASK 1 (CROP): Locate the core performance summary section. The crop MUST start ABOVE the 4 small circular category gauges ("Performances", "Accessibilité", "Bonnes pratiques", "SEO"). It MUST include these 4 small gauges at the top, the large main "Performances" gauge below them, and the mobile/desktop screenshot thumbnail on the right side. The crop MUST END just below the "Performances" scale (the red/orange/green triangles with 0-49, 50-89, 90-100). Do NOT include the "Analysez les problèmes de performances" list section. Return CROP: x=[left], y=[top], width=[content_width], height=[total_height].
    TASK 2 (SCORE): Look at the main "Performances" gauge (the largest circle, usually green, orange, or red with a number). What is the exact number inside that main circle? Return SCORE: [number between 0 and 100].
    Return both tasks on separate lines.
    `;

    console.log("Asking GPT-4o with dual prompt...");
    try {
        const rawResponse = await analyzeImage(testImage, cropPrompt);
        console.log("----- RAW VISION RESPONSE -----");
        console.log(rawResponse);
        console.log("-------------------------------");

        const scoreMatch = rawResponse.match(/SCORE:\s*(\d{1,3})/i);
        console.log("Score Match?", scoreMatch ? scoreMatch[1] : null);

        const cropMatch = rawResponse.match(/CROP:\s*x=(\d+),\s*y=(\d+),\s*width=(\d+),\s*height=(\d+)/i);
        console.log("Crop Match?", cropMatch ? cropMatch.slice(1, 5) : null);

    } catch (e) {
        console.error("Vision test failed:", e);
    }
}

testPsiVisionRaw();
