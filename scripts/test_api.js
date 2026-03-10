const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

const runTests = async () => {
    try {
        console.log('--- Starting API Tests ---');

        // 1. Signup
        console.log('\n1. Testing Signup...');
        const email = `test_${Date.now()}@example.com`;
        const password = 'password123';
        let verificationToken = '';
        let userId = '';

        try {
            const signupRes = await axios.post(`${BASE_URL}/auth/signup`, { email, password });
            console.log('Signup Success:', signupRes.data);
            userId = signupRes.data.userId;

            // In a real scenario, we can't get the token without email access.
            // However, our local dev setup LOGS the token to stdout.
            // For automated testing without scraping logs, we'd need a backdoor or DB access.
            // Let's assume for this script we PAUSE and ask user? No, that blocks.
            // Let's rely on the fact that for now we can't easily verify w/o DB access in this script.
            // BUT, I can query the DB directly since I have prisma here!

        } catch (e) {
            console.error('Signup Failed:', e.response ? e.response.data : e.message);
            return;
        }

        // 1b. Get Verification Token from DB (Cheating for test script)
        console.log('\n1b. Fetching Verification Token from DB...');
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();

        const user = await prisma.user.findUnique({ where: { email } });
        verificationToken = user.verification_token;
        console.log('Token found:', verificationToken);

        // 2. Verify
        console.log('\n2. Testing Verification...');
        try {
            const verifyRes = await axios.get(`${BASE_URL}/auth/verify?token=${verificationToken}`);
            console.log('Verify Success:', verifyRes.data);
        } catch (e) {
            console.error('Verify Failed:', e.response ? e.response.data : e.message);
            return;
        }

        // 3. Login
        console.log('\n3. Testing Login...');
        let authToken = '';
        try {
            const loginRes = await axios.post(`${BASE_URL}/auth/login`, { email, password });
            console.log('Login Success. Token received.');
            authToken = loginRes.data.token;
        } catch (e) {
            console.error('Login Failed:', e.response ? e.response.data : e.message);
            return;
        }

        // 4. Create Order
        console.log('\n4. Testing Create Order...');
        try {
            const orderRes = await axios.post(`${BASE_URL}/orders/create`, {
                birth_details: {
                    name: "Test User",
                    date: "1990-01-01",
                    time: "12:00",
                    lat: 28.61,
                    lon: 77.20
                }
            }, {
                headers: { Authorization: `Bearer ${authToken}` }
            });
            console.log('Order Created:', orderRes.data);

            const orderId = orderRes.data.order_id;

            // 5. Trigger Webhook (Mock Payment)
            console.log('\n5. Testing Payment Webhook...');
            const webhookRes = await axios.post(`${BASE_URL}/webhooks/payment`, {
                order_id: orderId,
                status: 'success'
            });
            console.log('Webhook Response:', webhookRes.data);

            console.log('\n--- TESTS COMPLETED SUCCESSFULLY ---');

        } catch (e) {
            console.error('Order/Webhook Failed:', e.response ? e.response.data : e.message);
        }

    } catch (error) {
        console.error('Test Suite Error:', error.message);
    }
};

runTests();
