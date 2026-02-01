const axios = require('axios');

const OPENROUTER_API_KEY = "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";
const SITE_URL = "https://astralis.app";
const SITE_NAME = "Astralis Report";

const SYSTEM_PROMPT = `You are an expert Vedic Astrologer. Return JSON only.`;

const userPrompt = `
TASK: Write a 1 sentence intro.
REQUIRED JSON FORMAT: { "content": "string" }
`;

async function testAI() {
    console.log("Testing AI Call...");
    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "google/gemini-2.0-flash-exp:free",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            }
        });

        console.log("Status:", response.status);
        console.log("Response:", JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error("Error:", e.message);
        if (e.response) {
            console.error("Data:", JSON.stringify(e.response.data, null, 2));
        }
    }
}

testAI();
