const axios = require('axios');

const OPENROUTER_API_KEY = "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";
const SITE_URL = "https://astralis.app";
const SITE_NAME = "Astralis Report";

async function run() {
    console.log("Testing Xiaomi Mimo...");
    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "xiaomi/mimo-v2-flash:free",
            messages: [
                { role: "user", content: "Say Hello" }
            ]
        }, {
            headers: {
                "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                "HTTP-Referer": SITE_URL,
                "X-Title": SITE_NAME,
                "Content-Type": "application/json"
            }
        });
        console.log("SUCCESS:", response.data);
    } catch (e) {
        if (e.response) {
            console.log(`ERROR: ${e.response.status}`, JSON.stringify(e.response.data));
        } else {
            console.log("ERROR:", e.message);
        }
    }
}

run();
