const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

// OLLAMA CONFIGURATION
const OLLAMA_BASE_URL = "http://localhost:11434/v1/chat/completions";
const OLLAMA_MODEL = "gpt-oss:20b-cloud"; // GPT OSS 20B Cloud model

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
    // Hardcoded for debugging
    // const dobRaw = "1998-11-26";
    // const timeRaw = "07:55";
    // const name = "Aditya Choudhary";
    // const lat = 21.216;
    // const lon = 81.323;


    const name = await askQuestion("Enter Name (Default: Aditya Choudhary): ") || "Aditya Choudhary";
    const dobRaw = await askQuestion("Enter DOB (YYYY-MM-DD) (Default: 1998-11-26): ") || "1998-11-26";
    const timeRaw = await askQuestion("Enter Time (HH:MM) (Default: 07:55): ") || "07:55";
    const lat = parseFloat(await askQuestion("Enter Latitude (Default: 21.216): ") || "21.216");
    const lon = parseFloat(await askQuestion("Enter Longitude (Default: 81.323): ") || "81.323");

    // const name = await askQuestion("Enter Name (Default: Aditya Choudhary): ") || "Piyush Kumar";
    // const dobRaw = await askQuestion("Enter DOB (YYYY-MM-DD) (Default: 1998-11-26): ") || "1999-02-24";
    // const timeRaw = await askQuestion("Enter Time (HH:MM) (Default: 07:55): ") || "17:09";
    // const lat = parseFloat(await askQuestion("Enter Latitude (Default: 21.216): ") || "23.674305");
    // const lon = parseFloat(await askQuestion("Enter Longitude (Default: 81.323): ") || "86.145656");


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

const SYSTEM_PROMPT = `You are an illuminated Vedic Astrologer, a master of Jyotish—the Science of Light. Your task is to decode the celestial hieroglyphs of a soul's descent into the physical plane. 

Analyze the provided planetary data through the lens of ancient wisdom. Your voice must be:
1. Mystical & Authoritative: Speak as one who sees the threads of destiny clearly.
2. Educational & Clear: Whenever you mention a planet, use its English name followed by its Hindi name in parentheses—e.g., Saturn (Shani).
3. Functional: Define the 'Duty' of the planet (e.g., Shani is the Great Teacher and Taskmaster) so the user understands its role in their life map.
4. Hopeful & Positive: Frame every placement as a gift or a necessary lesson in the soul's blueprint.
5. If you want to do any text formatting for content or analysis, use html tags.

Very IMPORTANT:
- Strictly stick to the provided JSON format.
- Return RAW JSON only. No markdown (no \`\`\`json), no preamble.
- Be hyper-specific to the degrees, signs, and house placements provided.
- Never use generic horoscopes; speak directly to the "Native" about their specific karmic alignment.`;

const PROMPTS = {
    intro: {
        schema: `{ "content": "string (2 detailed paragraphs)", "insight": "string (1 line punchy quote)" }`,
        task: "Write a mystical opening. The content should be around 1000 characters. Explain that the Udaya Lagna (Ascendant) is the physical vessel and the Moon (Chandra) is the emotional landscape. Describe this report not as a 'prediction', but as a sacred map of the vibrations they chose at the moment of their first breath. Use terms like 'Celestial Tapestry' or 'Soul's Blueprint'."
    },
    charts: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"] }`,
        task: "Analyze the Janma Kundali (Birth Chart). Evaluate the foundational strength (Bala) of the chart. Discuss the distribution of planets—are they concentrated (creating intense focus) or scattered (creating diverse experiences)? Mention the impact of the 'Graha Drishti' (planetary gazes) on the overall life path, explaining that 'Drishti' is the focused energy a planet casts upon another house."
    },
    personality: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "strength", "title": "Elemental Temperament", "data": [{ "l": "Fire (Agni)", "v": 0 - 100, "c": "#E91E63" }, { "l": "Water (Jala)", "v": 0 - 100, "c": "#009688" }, { "l": "Air (Vayu)", "v": 0 - 100, "c": "#FFC107" }, { "l": "Earth (Prithvi)", "v": 0 - 100, "c": "#795548" }] }] }`,
        task: "Synthesize the Sun (Surya - The Soul), Moon (Chandra - The Mind), and Ascendant (Lagna - The Body). Determine the native's 'Prakriti' (nature). Explain how this mix of Fire, Water, Air, and Earth dictates their temperament and psychological depth in simple, non-confusing terms."
    },
    ascendant: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [] }`,
        task: "Deep dive into the Lagna and its Lord (Lagnesha). Describe their physical aura and the initial vibration they project. Explain that the Lagnesha is the 'Captain of the Ship' and its placement determines their self-confidence and vitality."
    },
    planets: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string", "string", "string", "string", "string", "string", "string", "string"] }`,
        task: "Perform a comprehensive reading of ALL nine Grahas. For each, use the format: English Name (Hindi Name) - Role. (e.g., 'Jupiter (Guru) - The Bringer of Wisdom'). Define the specific duty of each planet: Sun (Surya/Soul), Moon (Chandra/Mind), Mars (Mangal/Energy), Mercury (Budha/Intellect), Jupiter (Guru/Wisdom), Venus (Shukra/Pleasure), Saturn (Shani/Discipline), Rahu (North Node/Obsession), and Ketu (South Node/Detachment). Provide one specific, hopeful insight for EACH planet in the predictions array, focusing on how its placement serves the native's growth."
    },
    health: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [] }`,
        task: "Analyze the 6th House (Shatru Bhava) and the vitality of the Sun (Surya). Identify potential 'weak links' in the physical vessel. Provide mystical wellness tips focused on balancing the 'Doshas' (biological energies) through meditation or elemental alignment."
    },
    love: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "strength", "title": "Love Alchemy", "data": [{ "l": "Passion (Kama)", "v": 0 - 100, "c": "#E91E63" }, { "l": "Loyalty (Dharma)", "v": 0 - 100, "c": "#009688" }, { "l": "Emotional Unity", "v": 0 - 100, "c": "#FFC107" }] }] }`,
        task: "Analyze the 7th House and Venus (Shukra - The Planet of Love). Explain the 'karmic contract' of their relationships. Discuss how the Moon (Chandra) influences their need for emotional safety within partnerships."
    },
    career: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [] }`,
        task: "Examine the Artha Trikona (Wealth houses). Focus on the 10th Lord and Saturn (Shani - The Lord of Karma). Suggest fields where the native can achieve 'Karma Bhava'—their true soul-work. Use D10 logic to define their professional archetype."
    },
    karma: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "strength", "title": "Karmic Weight", "data": [{ "l": "Sanchita (The Reservoir)", "v": 0 - 100, "c": "#9C27B0" }, { "l": "Prarabdha (The Arrow)", "v": 0 - 100, "c": "#3F51B5" }] }] }`,
        task: "Explain the axis of Rahu (The Dragon's Head) and Ketu (The Dragon's Tail). Define Rahu as the 'Future Pull' and Ketu as the 'Past Wisdom.' Use Saturn (Shani) to identify the specific 'Pending Karma' or life-debt that must be paid with patience."
    },
    driving: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "driving_factors", "data": [{ "l": "Dharma (Purpose)", "v": 0 - 100 }, { "l": "Artha (Prosperity)", "v": 0 - 100 }, { "l": "Kama (Desire)", "v": 0 - 100 }, { "l": "Moksha (Liberation)", "v": 0 - 100 }] }] }`,
        task: "Analyze the 4 Purusharthas (Life Goals). Explain which goal dominates their current spiritual focus: Dharma (Duty), Artha (Wealth), Kama (Desire), or Moksha (Liberation)."
    },
    lucky: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "gem", "gemHindi": "string", "gemEng": "string" }] }`,
        task: "Recommend the most prominent 'Yoga Karaka' gemstone—the celestial filter that strengthens their most helpful planet. Explain why this specific vibration harmonizes their aura. Provide the Hindi and English name for the stone."
    },
    celebs: {
        schema: `{ "analysis": "string", "coreInsight": "string", "predictions": ["string", "string"], "widgets": [{ "type": "celebs", "data": ["string", "string", "string", "string"] }] }`,
        task: "Identify 4 famous personalities with the same Nakshatra (Lunar Mansion). Explain the shared 'Soul-Vibration' of that specific Nakshatra, using its name and primary characteristic (e.g., 'The Power of the Crown' for Magha)."
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

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const requestBody = {
                model: OLLAMA_MODEL,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userPrompt }
                ]
            };

            if (attempt === 1) {
                fs.appendFileSync('ai_debug.log', `REQUEST BODY:\n${JSON.stringify(requestBody, null, 2)}\n`);
            }

            const response = await axios.post(OLLAMA_BASE_URL, requestBody, {
                headers: {
                    "Content-Type": "application/json"
                }
            });

            let content = response.data.choices[0].message.content.trim();
            if (attempt === 1) { // Log mainly on first attempt or maybe all
                fs.appendFileSync('ai_debug.log', `STATUS: ${response.status}\nRAW CONTENT (Attempt ${attempt}):\n${content}\n`);
            }

            // Robust cleanup for Markdown/JSON
            content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "");

            // Helper to extract JSON from text
            const extractJSON = (str) => {
                const firstOpen = str.indexOf('{');
                const lastClose = str.lastIndexOf('}');
                if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
                    return str.substring(firstOpen, lastClose + 1);
                }
                return str;
            };

            const jsonContent = extractJSON(content);

            try {
                return JSON.parse(jsonContent);
            } catch (parseErr) {
                const msg = `   ! JSON Parse Failed for [${sectionId}] (Attempt ${attempt}/${MAX_RETRIES}).`;
                console.error(msg + ` Raw content length: ${content.length}`);
                fs.appendFileSync('ai_debug.log', `ERROR: ${msg}\nRAW CONTENT LOOKED LIKE:\n${content}\n`);

                if (attempt === MAX_RETRIES) return null;
                throw new Error("JSON Parse Failed"); // Trigger retry
            }

        } catch (e) {
            let errMsg = "";
            if (e.response) {
                errMsg = `AI Error [${sectionId}]: ${e.response.status} - ${JSON.stringify(e.response.data)}`;
            } else {
                errMsg = `AI Error [${sectionId}]: ${e.message}`;
            }

            console.error(`   ! ${errMsg} (Attempt ${attempt}/${MAX_RETRIES})`);
            fs.appendFileSync('ai_debug.log', `ERROR: ${errMsg}\n`);

            if (attempt < MAX_RETRIES) {
                console.log(`   > Retrying in ${RETRY_DELAY}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            } else {
                return null;
            }
        }
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
