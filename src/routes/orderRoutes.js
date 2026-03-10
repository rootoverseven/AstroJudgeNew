const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authenticateToken = require('../middleware/authMiddleware');

// Protected route
router.post('/create', authenticateToken, orderController.createOrder);

// Public webhook (usually)
router.post('/payment', orderController.handlePaymentWebhook);

module.exports = router;
