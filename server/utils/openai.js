import OpenAI from 'openai';
import 'dotenv/config';

let _openai = null;

function getOpenAI() {
    if (!_openai) {
        if (!process.env.OPENAI_API_KEY) {
            console.error('[OPENAI] Missing OPENAI_API_KEY in environment.');
            throw new Error('OPENAI_API_KEY is not configured.');
        }
        _openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return _openai;
}

export async function analyzeImage(imageUrl, prompt) {
    try {
        const client = getOpenAI();
        const response = await client.chat.completions.create({
            model: "gpt-4o-2024-05-13",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        {
                            type: "image_url",
                            image_url: {
                                "url": imageUrl,
                            },
                        },
                    ],
                },
            ],
            max_tokens: 500,
        });

        return response.choices[0].message.content;
    } catch (err) {
        console.error('[OPENAI] Vision analysis error:', err.message || err);
        throw err;
    }
}
