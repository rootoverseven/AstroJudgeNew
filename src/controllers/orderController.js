const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const reportService = require('../services/reportService');

const createOrder = async (req, res) => {
    try {
        const { birth_details } = req.body;
        // Assume user is attached by authMiddleware
        const userId = req.user.userId;

        const report = await prisma.report.create({
            data: {
                user_id: userId,
                birth_details: birth_details,
                status: 'PENDING_PAYMENT'
            }
        });

        // Mock Payment Intent
        const paymentClientSecret = `pi_mock_${Math.random().toString(36).substring(7)}`;

        res.json({
            order_id: report.id,
            payment_client_secret: paymentClientSecret
        });

    } catch (error) {
        console.error("Create Order Error:", error);
        res.status(500).json({ error: error.message });
    }
};

const handlePaymentWebhook = async (req, res) => {
    try {
        // In a real app, verify Stripe signature
        const { order_id, status } = req.body;

        if (status === 'success') {
            await prisma.report.update({
                where: { id: order_id },
                data: { status: 'PROCESSING' } // Or PAID, then PROCESSING
            });

            // Trigger generation in background
            // We do NOT await this, so the webhook returns 200 quickly
            reportService.generateReport(order_id).catch(err => {
                console.error(`Background generation failed for ${order_id}:`, err);
            });

            res.json({ received: true });
        } else {
            res.status(400).json({ error: 'Invalid status' });
        }
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    createOrder,
    handlePaymentWebhook
};
