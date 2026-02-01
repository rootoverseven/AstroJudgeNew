const fs = require('fs');
const puppeteer = require('puppeteer');
const path = require('path');
const axios = require('axios');
const readline = require('readline');

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
    const name = await askQuestion("Enter Name (Default: Rahul): ") || "Rahul";
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

// --- MAIN FUNCTION ---
async function main() {
    console.log("\n--- ASTRALIS PDF GENERATOR ---\n");

    try {
        // 1. Get Input
        const user = await getUserInput();
        console.log(`\nFetching Planetary Positions for ${user.name}...`);

        // 2. Call API
        const response = await axios.post("https://json.freeastrologyapi.com/planets", user.payload, {
            headers: { "Content-Type": "application/json", "x-api-key": "Y3b5dVO1YEaXQR3upseq96DCdZjtrF97QDketb8b" }
        });

        if (response.status !== 200) {
            throw new Error(`API Error: ${response.status}`);
        }

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

        console.log("Data received. Processing...");

        // 3. Prepare Report Data object to inject
        // We reuse the structure from current pdf.html but replace dynamic parts
        const reportData = {
            subject: {
                name: user.name,
                dob: user.dobDisplay,
                time: user.timeDisplay,
                location: `${user.payload.latitude.toFixed(2)}, ${user.payload.longitude.toFixed(2)}`,
                refNo: `AST-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
                reportDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            },
            // Keep the static sections as they are (or you could dynamically generate them too)
            // For now, we assume the HTML template has a function or object we can overwrite
            sections: [
                {
                    id: "intro",
                    title: "Introduction",
                    hindi: "प्रस्तावना",
                    icon: "book-open",
                    content: `<p><span style="font-size: 3rem; float: left; margin-right: 8px; font-family: var(--font-retro); color: var(--teal); line-height: 1;">T</span>his document serves as the architectural blueprint of your existence. Unlike a generic horoscope, this is a calculated analysis of the celestial mechanics operating at the precise moment of your birth.</p><p>We have analyzed the planetary positions, the lunar constellations (Nakshatras), and the karmic nodes to generate this dossier. It is designed to reveal not just "what" will happen, but "why" you are the way you are.</p>`,
                    insight: "The stars impel, they do not compel. This report is a map, but you are the navigator."
                },
                {
                    id: "charts",
                    title: "Charts",
                    hindi: "जन्म कुंडली",
                    icon: "activity",
                    analysis: "The Janma Kundali (Birth Chart) is the primary map. It shows the exact position of planets at the time of birth. Your chart reveals a strong concentration of energy in the Dharma Trikona, suggesting a life guided by purpose.",
                    coreInsight: "Planets in the Kendra houses grant you the power to influence your environment.",
                    predictions: ["Your Ascendant Lord is well placed, promising good health.", "Rahu's position indicates a hunger for unconventional success."],
                    widgets: [{ type: "kundali" }]
                },
                {
                    id: "personality",
                    title: "True Self & Personality",
                    hindi: "व्यक्तित्व",
                    icon: "user",
                    analysis: "Your Sun in Libra indicates a soul that strives for balance. You are the mediator. However, your Moon in Scorpio adds intense emotional depth that you often hide from the world.",
                    coreInsight: "You present a calm exterior, but your internal world is a storm of passion.",
                    predictions: ["Greatest fulfillment comes from bridging opposing viewpoints.", "Learn to express anger constructively."],
                    widgets: [{ type: "strength", title: "Elements", data: [{ l: "Fire", v: 30, c: "#E91E63" }, { l: "Water", v: 60, c: "#009688" }, { l: "Air", v: 80, c: "#FFC107" }] }]
                },
                {
                    id: "ascendant",
                    title: "Ascendant Archetype",
                    hindi: "लग्न राशि",
                    icon: "crown",
                    analysis: "Rising in Leo, you naturally command attention. You have a regal aura and a need to be appreciated. This is not arrogance, but a solar necessity to shine warmth on others.",
                    coreInsight: "Your mask is that of a Monarch, even when you feel vulnerable.",
                    predictions: ["Natural leadership roles suit you best.", "Pride is your double-edged sword."],
                    widgets: []
                },
                {
                    id: "planets",
                    title: "Planetary Reading",
                    hindi: "ग्रह फल",
                    icon: "sun",
                    analysis: "Mercury in Virgo gives you a sharp, analytical mind. Mars in Sagittarius drives you towards philosophical conquests and travel. Saturn acts as a stabilizing force in your career sector.",
                    coreInsight: "Saturn's aspect on the Moon suggests emotional maturity came early in life.",
                    predictions: ["Mercury periods favor business and commerce.", "Jupiter transits bring expansion in knowledge."],
                    widgets: [{ type: "planetary_table" }]
                },
                {
                    id: "health",
                    title: "Health & Wellness",
                    hindi: "स्वास्थ्य",
                    icon: "activity",
                    analysis: "With the 6th Lord in a dusthana, you must watch your digestive system. Virgo rules the gut, and anxiety tends to manifest physically for you. A balanced diet is crucial.",
                    coreInsight: "Your physical health is a direct reflection of your mental state.",
                    predictions: ["Prone to acidity during high-stress periods.", "Meditation is a medical necessity for you."],
                    widgets: []
                },
                {
                    id: "love",
                    title: "Love & Relationships",
                    hindi: "प्रेम संबंध",
                    icon: "heart",
                    analysis: "Venus in the 3rd house suggests love found through communication or neighbors. You need mental stimulation. Saturn in the 7th indicates a partner who is mature, serious, and perhaps older.",
                    coreInsight: "You seek a mirror, not just a lover. Intellectual bond is key.",
                    predictions: ["Marriage may be delayed but will be stable.", "A significant relationship cycle begins in 2027."],
                    widgets: [{ type: "strength", title: "Love Metrics", data: [{ l: "Passion", v: 85, c: "#E91E63" }, { l: "Loyalty", v: 95, c: "#009688" }, { l: "Talk", v: 60, c: "#FFC107" }] }]
                },
                {
                    id: "career",
                    title: "Career & Money",
                    hindi: "धन और करियर",
                    icon: "briefcase",
                    analysis: "The 10th Lord in the 2nd house creates a Dhan Yoga. Your career is linked to finance, speech, or family assets. You are built for banking, law, or high-end consultancy.",
                    coreInsight: "You do not work for passion alone; you work to build a legacy.",
                    predictions: ["Wealth accumulation accelerates after age 32.", "Investments in land will be profitable."],
                    widgets: []
                },
                {
                    id: "karma",
                    title: "Karmic Life Lessons",
                    hindi: "कर्म फल",
                    icon: "eye",
                    analysis: "Saturn is your taskmaster. Placed in the relationship sector, your karma involves learning patience and compromise with others. You are clearing debts from past lives through service.",
                    coreInsight: "Your karma is to serve partners even when it feels heavy.",
                    predictions: ["Recurring patterns of betrayal until boundaries are set.", "Success comes through slow, steady effort."],
                    widgets: [{ type: "strength", title: "Karmic Load", data: [{ l: "Sanchita", v: 40, c: "#E91E63" }, { l: "Prarabdha", v: 80, c: "#009688" }] }]
                },
                {
                    id: "driving",
                    title: "Driving Factors",
                    hindi: "धर्म अर्थ काम मोक्ष",
                    icon: "sparkles",
                    analysis: "Your chart is weighted towards Artha (Wealth) and Kama (Desire). You are driven by tangible achievements in this lifetime. Moksha (Liberation) becomes a focus only in later years.",
                    coreInsight: "Balance your material ambition with spiritual grounding.",
                    predictions: ["High ambition drives your 30s.", "Spiritual awakening indicated around age 45."],
                    widgets: [{
                        type: "driving_factors",
                        data: [{ l: "Dharma", v: 20 }, { l: "Artha", v: 50 }, { l: "Kama", v: 25 }, { l: "Moksha", v: 5 }]
                    }]
                },
                {
                    id: "lucky",
                    title: "Lucky Color & Gemstone",
                    hindi: "भाग्य रत्न",
                    icon: "gem",
                    analysis: "To strengthen Venus and appease Saturn, specific wavelengths of light are recommended. Blue Sapphire (Neelam) is your primary stone for career stability.",
                    coreInsight: "Blue is your power color. Avoid excessive Red.",
                    predictions: ["Wear Blue Sapphire on the middle finger.", "Use Platinum or White Gold settings."],
                    widgets: [{ type: "gem", gemHindi: "नीलम", gemEng: "Blue Sapphire" }]
                },
                {
                    id: "celebs",
                    title: "Celebrity Twins",
                    hindi: "सितारे",
                    icon: "star",
                    analysis: "You share your Moon Nakshatra (Jyeshtha) with these personalities. This indicates a shared emotional temperament—intense, strategic, and often misunderstood.",
                    coreInsight: "You share the 'Strategist' archetype with these icons.",
                    predictions: ["Potential for public recognition.", "Similar struggles with privacy."],
                    widgets: [{ type: "celebs", data: ["Albert Einstein", "Nicole Kidman", "Elvis Presley", "Katy Perry"] }]
                }
            ],
            chartData: planetsData
        };

        // 4. Read Template
        const htmlPath = path.join(__dirname, 'pdf.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // 5. Inject Data
        // Replaces the const reportData = { ... }; block in the HTML
        // Regex looks for "const reportData = {" up to the next "};"
        // This is a bit fragile if the object contains "};" strings, but strictly for the current template structure:
        const dataInjection = `const reportData = ${JSON.stringify(reportData, null, 4)};`;
        const pattern = /const\s+reportData\s*=\s*\{[\s\S]*?\};/;

        if (pattern.test(htmlContent)) {
            htmlContent = htmlContent.replace(pattern, dataInjection);
            console.log("Data injected into HTML.");
        } else {
            console.warn("Could not find 'const reportData = { ... };' block to replace. using raw template.");
        }

        // 6. Clean up (remove client-side auto-gen if present)
        htmlContent = htmlContent.replace(/setTimeout\(generateFullPDF, 2000\);/g, '');
        htmlContent = htmlContent.replace(/<script src=".*html2pdf.*"><\/script>/g, '');

        // 7. Generate PDF
        console.log("Launching Browser...");
        const browser = await puppeteer.launch({ headless: "new" });
        const page = await browser.newPage();

        // ENABLE LOGGING
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));

        // Optimize for large content
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
        console.error("Error:", e.message);
    }
}

main();
