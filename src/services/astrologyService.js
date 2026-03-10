const BASE_URL = "https://json.freeastrologyapi.com/planets";
const API_KEY = process.env.ASTROLOGY_API_KEY || "Y3b5dVO1YEaXQR3upseq96DCdZjtrF97QDketb8b";

/**
 * Format user input into the payload required by the astrology API.
 * @param {Object} input - { date, time, lat, lon }
 * @returns {Object} - Payload for API
 */
const formatPayload = (input) => {
    const [year, month, day] = input.date.split('-').map(Number);
    const [hour, minute] = input.time.split(':').map(Number);

    return {
        "year": year,
        "month": month,
        "date": day,
        "hours": hour,
        "minutes": minute,
        "seconds": 0,
        "latitude": input.lat,
        "longitude": input.lon,
        "timezone": 5.5,
        "config": {
            "observation_point": "topocentric",
            "ayanamsha": "lahiri",
            "chart_style": "NORTH_INDIAN"
        }
    };
};

/**
 * Fetch planetary data from the API.
 * @param {Object} payload
 * @returns {Object} - Planetary data
 */
const fetchPlanetaryData = async (payload) => {
    try {
        const response = await fetch(BASE_URL, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
                "x-api-key": API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Astrology API Error: ${response.status}`);
        }

        const planetsData = await response.json();

        // Filter out unwanted planets
        if (planetsData.output && planetsData.output[0]) {
            const out = planetsData.output[0];
            Object.keys(out).forEach(key => {
                const p = out[key];
                if (p.name && ["Uranus", "Neptune", "Pluto"].includes(p.name)) {
                    delete out[key];
                }
            });
        }

        return planetsData;
    } catch (error) {
        console.error("Error fetching planetary data:", error.message);
        throw error;
    }
};

module.exports = {
    formatPayload,
    fetchPlanetaryData
};
