const axios = require('axios');

// OLLAMA CONFIGURATION
const OLLAMA_BASE_URL = "http://localhost:11434/v1/chat/completions";
const OLLAMA_MODEL = "gpt-oss:20b-cloud";

const SYSTEM_PROMPT = `You are an expert Vedic Astrologer. Return JSON only.`;

const userPrompt = `
TASK: Write a 1 sentence intro.
REQUIRED JSON FORMAT: { "content": "string" }
`;

async function testAI() {
    console.log("Testing AI Call...");
    try {
        const response = await axios.post(OLLAMA_BASE_URL, {
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ]
        }, {
            headers: {
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
