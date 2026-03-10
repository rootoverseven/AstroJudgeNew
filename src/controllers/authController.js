const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_prod';

const signup = async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if user exists
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) return res.status(400).json({ error: 'User already exists' });

        const user = await prisma.user.create({
            data: {
                email,
                password_hash: hashedPassword,
                verification_token: Math.random().toString(36).substring(7) // Simple token
            }
        });

        // TODO: Send verification email
        // For MVP, just return the token in response or logs
        console.log(`Verification Token for ${email}: ${user.verification_token}`);

        res.json({ message: 'User created. Please verify email.', userId: user.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const verify = async (req, res) => {
    try {
        const { token } = req.query;
        const user = await prisma.user.findFirst({ where: { verification_token: token } });

        if (!user) return res.status(400).json({ error: 'Invalid token' });

        await prisma.user.update({
            where: { id: user.id },
            data: { is_verified: true, verification_token: null }
        });

        res.json({ message: 'Email verified successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        if (!user.is_verified) return res.status(403).json({ error: 'Email not verified' });

        const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });

        res.json({ token, user: { id: user.id, email: user.email, is_verified: user.is_verified } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    signup,
    verify,
    login
};
