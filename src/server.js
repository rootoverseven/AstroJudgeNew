const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhooks', orderRoutes); // Reusing orderRoutes for webhook for now

app.get('/', (req, res) => {
    res.send('AstroJudge Backend is running.');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
