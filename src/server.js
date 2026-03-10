const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

console.log('=== SERVER STARTUP ===');
console.log('NODE_VERSION:', process.version);
console.log('PORT env:', process.env.PORT);

const authRoutes = require('./routes/authRoutes');
console.log('authRoutes loaded');

const orderRoutes = require('./routes/orderRoutes');
console.log('orderRoutes loaded');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhooks', orderRoutes);

app.get('/', (req, res) => {
    res.send('AstroJudge Backend is running.');
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

console.log(`Calling app.listen on port ${PORT}...`);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
