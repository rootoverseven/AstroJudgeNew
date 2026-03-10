const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const fetchSectionContent = async (sectionId, planetaryData) => {
    if (!PROMPTS[sectionId]) return null;
    const { schema, task } = PROMPTS[sectionId];
    const context = JSON.stringify(planetaryData.output[0], null, 2);

    const userPrompt = `
    TASK: ${task}
    PLANETARY DATA: ${context}
    REQUIRED JSON FORMAT: ${schema}
    `;

    console.log(`   > Asking Gemini AI for [${sectionId}]...`);
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: userPrompt,
                config: {
                    systemInstruction: SYSTEM_PROMPT,
                    responseMimeType: 'application/json',
                    temperature: 0.7
                }
            });

            let content = response.text;

            const extractJSON = (str) => {
                const firstOpen = str.indexOf('{');
                const lastClose = str.lastIndexOf('}');
                if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
                    return str.substring(firstOpen, lastClose + 1);
                }
                return str;
            };

            const jsonContent = extractJSON(content);
            return JSON.parse(jsonContent);

        } catch (e) {
            console.error(`   ! AI Error [${sectionId}] Attempt ${attempt}: ${e.message}`);
            if (attempt < MAX_RETRIES) {
                await delay(RETRY_DELAY);
            } else {
                return null;
            }
        }
    }
};

module.exports = {
    fetchSectionContent,
    SYSTEM_PROMPT,
    PROMPTS
};
