const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

// OPENROUTER API KEY - USER MUST PROVIDE
const OPENROUTER_API_KEY = "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";
const SITE_URL = "https://astralis.app"; // Required for OpenRouter
const SITE_NAME = "Astralis Report";

// --- UTILS ---
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }));
}

// Map User Input to API Payload
async function getUserInput() {
    // Default values if user presses Enter
    const name = await askQuestion("Enter Name (Default: Aditya Choudhary): ") || "Aditya Choudhary";
    const dobRaw = await askQuestion("Enter DOB (YYYY-MM-DD) (Default: 1998-11-26): ") || "1998-11-26";
    const timeRaw = await askQuestion("Enter Time (HH:MM) (Default: 07:55): ") || "07:55";
    const lat = parseFloat(await askQuestion("Enter Latitude (Default: 21.216): ") || "21.216");
    const lon = parseFloat(await askQuestion("Enter Longitude (Default: 81.323): ") || "81.323");

    const [year, month, day] = dobRaw.split('-').map(Number);
    const [hour, minute] = timeRaw.split(':').map(Number);

    return {
        name,
        dobDisplay: `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1]} ${year}`,
        timeDisplay: timeRaw,
        payload: {
            "year": year,
            "month": month,
            "date": day,
            "hours": hour,
            "minutes": minute,
            "seconds": 0,
            "latitude": lat,
            "longitude": lon,
            "timezone": 5.5,
            "config": {
                "observation_point": "topocentric",
                "ayanamsha": "lahiri",
                "chart_style": "NORTH_INDIAN"
            }
        }
    };
}

// --- AI CONTENT GENERATION ---

const SYSTEM_PROMPT = `You are an expert Vedic Astrologer. Analyze the provided planetary data and return a JSON object for the requested section. 
IMPORTANT:
1. Return RAW JSON only. No markdown (no \`\`\`json), no preamble.
2. Be specific to the planetary positions provided.
3. Use a mystical, authoritative, yet empathetic tone.`;

const PROMPTS = {
    intro: {
        schema: `{ "content": "string (2 paragraphs)", "insight": "string (1 line punchy quote)" }`,
        task: "Write an introduction based on the Ascendant and Moon sign. Explain that this is a calculated blueprint of their soul."
    },
    charts: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"] }`,
        task: "Analyze the foundational strength of the birth chart (Janma Kundali). Discuss the Ascendant placement and overall planetary distribution."
    },
    personality: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "strength", "title": "Elements", "data": [{ "l": "Fire", "v": 0-100, "c": "#E91E63" }, { "l": "Water", "v": 0-100, "c": "#009688" }, { "l": "Air", "v": 0-100, "c": "#FFC107" }] }] }`,
        task: "Analyze the person's true self based on Sun, Moon, and Ascendant. Estimate Element balance (Fire/Water/Air) based on these signs."
    },
    ascendant: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [] }`,
        task: "Deep dive into the Ascendant (Lagna) sign and its Lord. Describe their physical presence, aura, and initial impact on others."
    },
    planets: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"] }`,
        task: "Provide a general reading of the key planets (excluding Moon/Ascendant covered elsewhere). Focus on Mars, Mercury, Jupiter."
    },
    health: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [] }`,
        task: "Analyze health potentials based on 6th House, 6th Lord, and Sun. Mention areas of caution and wellness tips."
    },
    love: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "strength", "title": "Love Metrics", "data": [{ "l": "Passion", "v": 0-100, "c": "#E91E63" }, { "l": "Loyalty", "v": 0-100, "c": "#009688" }, { "l": "Talk", "v": 0-100, "c": "#FFC107" }] }] }`,
        task: "Analyze relationships based on Venus and 7th House. Estimate Love Metrics (Passion/Loyalty/Communication)."
    },
    career: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [] }`,
        task: "Analyze career/wealth based on 10th House, 2nd House, Saturn, and Jupiter. Suggest suitable fields."
    },
    karma: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "strength", "title": "Karmic Load", "data": [{ "l": "Sanchita", "v": 0-100, "c": "#E91E63" }, { "l": "Prarabdha", "v": 0-100, "c": "#009688" }] }] }`,
        task: "Analyze life lessons and karma based on Saturn and Rahu/Ketu. Estimate Karmic Load."
    },
    driving: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "driving_factors", "data": [{ "l": "Dharma", "v": 0-100 }, { "l": "Artha", "v": 0-100 }, { "l": "Kama", "v": 0-100 }, { "l": "Moksha", "v": 0-100 }] }] }`,
        task: "Analyze the 4 Purusharthas. Estimate the percentage focus on Dharma, Artha, Kama, Moksha based on planet distribution in houses."
    },
    lucky: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "gem", "gemHindi": "string", "gemEng": "string" }] }`,
        task: "Recommend a Lucky Gemstone based on the Ascendant Lord or most benefic planet. Provide name in English and Hindi."
    },
    celebs: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "celebs", "data": ["string", "string", "string", "string"] }] }`,
        task: "Identify 4 famous people who share the same Moon Sign or Nakshatra. Briefly explain the shared trait."
    }
};

// Helper for rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSectionContent(sectionId, planetaryData) {
    if (!PROMPTS[sectionId]) return null;
    const { schema, task } = PROMPTS[sectionId];

    // Simplify planetary data for AI to save tokens/noise
    const context = JSON.stringify(planetaryData.output[0], null, 2);

    const userPrompt = `
    TASK: ${task}
    PLANETARY DATA: ${context}
    REQUIRED JSON FORMAT: ${schema}
    `;

    console.log(`   > Asking AI for [${sectionId}]...`);
    fs.appendFileSync('ai_debug.log', `\n--- [${sectionId}] REQUEST ---\n`);

    try {
        const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
            model: "xiaomi/mimo-v2-flash:free", // Valid Free model found!
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

        let content = response.data.choices[0].message.content.trim();
        fs.appendFileSync('ai_debug.log', `STATUS: ${response.status}\nRAW CONTENT:\n${content}\n`);

        // Robust cleanup for Markdown/JSON
        // Replaces ```json ... ``` and ``` ... ```
        content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");

        try {
            return JSON.parse(content);
        } catch (parseErr) {
            const msg = `   ! JSON Parse Failed for [${sectionId}].`;
            console.error(msg + ` Raw content: ${content.substring(0, 50)}...`);
            fs.appendFileSync('ai_debug.log', `ERROR: ${msg}\n`);
            return null;
        }

    } catch (e) {
        let errMsg = "";
        if (e.response) {
            errMsg = `   ! AI Error [${sectionId}]: ${e.response.status} - ${JSON.stringify(e.response.data)}`;
        } else {
            errMsg = `   ! AI Error [${sectionId}]: ${e.message}`;
        }
        console.error(errMsg);
        fs.appendFileSync('ai_debug.log', `ERROR: ${errMsg}\n`);
        return null;
    }
}


// --- MAIN FUNCTION ---
async function main() {
    console.log("\n--- ASTRALIS PDF GENERATOR ---\n");

    try {
        // 1. Get Input
        const user = await getUserInput();
        console.log(`DEBUG: Got user input - Name: ${user.name}, DOB: ${user.dobDisplay}`);
        console.log(`\nFetching Planetary Positions for ${user.name}...`);

        // 2. Call Astrology API
        const response = await axios.post("https://json.freeastrologyapi.com/planets", user.payload, {
            headers: { "Content-Type": "application/json", "x-api-key": "Y3b5dVO1YEaXQR3upseq96DCdZjtrF97QDketb8b" }
        });

        if (response.status !== 200) throw new Error(`API Error: ${response.status}`);

        const planetsData = response.data;

        // Filter out Uranus, Neptune, Pluto
        if (planetsData.output && planetsData.output[0]) {
            const out = planetsData.output[0];
            Object.keys(out).forEach(key => {
                const p = out[key];
                if (p.name && ["Uranus", "Neptune", "Pluto"].includes(p.name)) {
                    delete out[key];
                }
            });
        }
        console.log("Planetary Data received. Filtering done.");

        // 3. Prepare Report Data Structure
        const reportData = {
            subject: {
                name: user.name,
                dob: user.dobDisplay,
                time: user.timeDisplay,
                location: `${user.payload.latitude.toFixed(2)}, ${user.payload.longitude.toFixed(2)}`,
                refNo: `AST-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
                reportDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            },
            sections: [], // Will populate this dynamically
            chartData: planetsData
        };

        // 4. Fetch AI Content for Each Section
        console.log("\n--- Generating AI Content ---");
        // Definition of sections to include in order
        const sectionOrder = [
            { id: "intro", title: "Introduction", hindi: "प्रस्तावना", icon: "book-open" },
            { id: "charts", title: "Charts", hindi: "जन्म कुंडली", icon: "activity" }, // Now Dynamic, removed static: true
            { id: "personality", title: "True Self & Personality", hindi: "व्यक्तित्व", icon: "user" },
            { id: "ascendant", title: "Ascendant Archetype", hindi: "लग्न राशि", icon: "crown" },
            { id: "planets", title: "Planetary Reading", hindi: "ग्रह फल", icon: "sun" },
            { id: "health", title: "Health & Wellness", hindi: "स्वास्थ्य", icon: "activity" },
            { id: "love", title: "Love & Relationships", hindi: "प्रेम संबंध", icon: "heart" },
            { id: "career", title: "Career & Money", hindi: "धन और करियर", icon: "briefcase" },
            { id: "karma", title: "Karmic Life Lessons", hindi: "कर्म फल", icon: "eye" },
            { id: "driving", title: "Driving Factors", hindi: "धर्म अर्थ काम मोक्ष", icon: "sparkles" },
            { id: "lucky", title: "Lucky Color & Gemstone", hindi: "भाग्य रत्न", icon: "gem" },
            { id: "celebs", title: "Celebrity Twins", hindi: "सितारे", icon: "star" }
        ];

        for (const meta of sectionOrder) {
            let sectionData = { ...meta };

            if (meta.static) {
                // For static sections (Charts), just assign defaults
                sectionData.analysis = "The Janma Kundali (Birth Chart) is the primary map. It shows the exact position of planets at the time of birth.";
                sectionData.coreInsight = "Planets in the Kendra houses grant you the power to influence your environment.";
                sectionData.predictions = ["Your Ascendant Lord is well placed.", "Rahu's position indicates a hunger for success."];
                sectionData.widgets = [{ type: "kundali" }];
            } else {
                // Fetch dynamic data
                // ADD DELAY BEFORE REQUEST to avoid 429
                if (meta.id !== "intro") { // Don't delay first one
                    process.stdout.write("   (waiting 5s for rate limit)...");
                    await delay(5000);
                    console.log(" done.");
                }

                const aiResult = await fetchSectionContent(meta.id, planetsData);
                if (aiResult) {
                    // Merge AI result
                    sectionData = { ...sectionData, ...aiResult };
                    // Ensure Planetary Table widget is preserved for 'planets' section if AI overwrites widgets
                    if (meta.id === 'planets') {
                        sectionData.widgets = [{ type: "planetary_table" }];
                    }
                    if (meta.id === 'charts') {
                        sectionData.widgets = [{ type: "kundali" }];
                    }
                } else {
                    console.warn(`   ! Failed to get content for ${meta.id}. Using placeholder.`);
                    sectionData.analysis = "Analysis unavailable at this moment. Please consult the chart.";
                    sectionData.coreInsight = "N/A";
                    sectionData.predictions = ["No predictions generated."];
                    sectionData.widgets = [];
                }
            }
            reportData.sections.push(sectionData);
        }

        // 5. Inject into HTML
        const htmlPath = path.join(__dirname, 'pdf.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        const dataInjection = `const reportData = ${JSON.stringify(reportData, null, 4)};`;
        const pattern = /const\s+reportData\s*=\s*\{[\s\S]*?\};/;
        if (pattern.test(htmlContent)) {
            htmlContent = htmlContent.replace(pattern, dataInjection);
            console.log("\nData injected into HTML.");
        } else {
            console.warn("Could not find 'const reportData' block.");
        }

        // Cleanup
        htmlContent = htmlContent.replace(/setTimeout\(generateFullPDF, 2000\);/g, '');
        htmlContent = htmlContent.replace(/<script src=".*html2pdf.*"><\/script>/g, '');

        // Save the populated HTML for debugging
        const debugHtmlPath = path.join(__dirname, 'generated_view.html');
        fs.writeFileSync(debugHtmlPath, htmlContent, 'utf8');
        console.log(`Debug HTML saved to: ${debugHtmlPath}`);

        // 6. Generate PDF
        console.log("Launching Browser...");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        // Debug logging
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

        await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        console.log("Rendering PDF...");
        const outputPath = path.join(__dirname, 'server_generated_report.pdf');
        await page.pdf({
            path: outputPath,
            printBackground: true,
            width: '210mm',
            height: '297mm',
            preferCSSPageSize: true
        });

        await browser.close();
        console.log(`\nSUCCESS: PDF generated at ${outputPath}`);

    } catch (e) {
        console.error("Fatal Error:", e.message);
    }
}

main();
