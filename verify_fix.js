const axios = require('axios');

// OLLAMA CONFIGURATION
const OLLAMA_BASE_URL = "http://localhost:11434/v1/chat/completions";
const OLLAMA_MODEL = "gpt-oss:20b-cloud";

async function run() {
    console.log("Testing Xiaomi Mimo...");
    try {
        const response = await axios.post(OLLAMA_BASE_URL, {
            model: OLLAMA_MODEL,
            messages: [
                { role: "user", content: "Say Hello" }
            ]
        }, {
            headers: {
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
