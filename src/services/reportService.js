const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const fs = require('fs');

const astrologyService = require('./astrologyService');
const aiService = require('./aiService');
const pdfService = require('./pdfService');

const generateReport = async (reportId) => {
    try {
        console.log(`Starting generation for Report ID: ${reportId}`);

        // 1. Fetch Report Data
        const report = await prisma.report.findUnique({ where: { id: reportId } });
        if (!report) throw new Error('Report not found');

        // Update status to PROCESSING
        await prisma.report.update({
            where: { id: reportId },
            data: { status: 'PROCESSING' }
        });

        const birthDetails = report.birth_details; // Assumes JSON structure matches

        // 2. Fetch Planetary Data
        const payload = astrologyService.formatPayload(birthDetails);
        const planetsData = await astrologyService.fetchPlanetaryData(payload);

        // 3. Prepare Base Report Data
        const reportData = {
            subject: {
                name: birthDetails.name,
                dob: birthDetails.date,
                time: birthDetails.time,
                location: `${birthDetails.lat}, ${birthDetails.lon}`,
                refNo: `AST-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
                reportDate: new Date().toLocaleDateString('en-GB')
            },
            sections: [],
            chartData: planetsData
        };

        // 4. Generate AI Content
        const sectionOrder = [
            { id: "intro", title: "Introduction", hindi: "प्रस्तावना", icon: "book-open" },
            { id: "charts", title: "Charts", hindi: "जन्म कुंडली", icon: "activity" },
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
            // Logic for static sections vs AI sections from original script
            // Assuming ALL sections in PROMPTS are dynamic except maybe Charts if customized

            // Artificial delay to prevent rate limits
            if (meta.id !== "intro") {
                await new Promise(r => setTimeout(r, 2000));
            }

            const aiResult = await aiService.fetchSectionContent(meta.id, planetsData);

            if (aiResult) {
                sectionData = { ...sectionData, ...aiResult };
                // Widget logic
                if (meta.id === 'planets') sectionData.widgets = [{ type: "planetary_table" }];
                if (meta.id === 'charts') sectionData.widgets = [{ type: "kundali" }];
            } else {
                // Fallback for failed AI
                sectionData.analysis = "Analysis unavailable at this moment.";
                sectionData.coreInsight = "N/A";
                sectionData.predictions = [];
                sectionData.widgets = [];
            }
            reportData.sections.push(sectionData);
        }

        // 5. Generate PDF
        const fileName = `report-${reportId}.pdf`;
        const outputPath = path.join(__dirname, '../../public/reports', fileName);

        await pdfService.generatePDF(reportData, outputPath);

        // 6. Update Report Record
        await prisma.report.update({
            where: { id: reportId },
            data: {
                status: 'COMPLETED',
                pdf_url: `/reports/${fileName}`
            }
        });

        console.log(`Report generated successfully: ${fileName}`);

    } catch (error) {
        console.error(`Error generating report ${reportId}:`, error);
        await prisma.report.update({
            where: { id: reportId },
            data: { status: 'FAILED' }
        });
    }
};

module.exports = {
    generateReport
};
