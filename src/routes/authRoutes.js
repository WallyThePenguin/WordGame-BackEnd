import express from 'express';
import { loginUser, registerUser, refreshToken } from '../services/authService.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

const allowedOrigins = [
  'http://localhost:3001',
  'http://validtesting.tplinkdns.com:3001'
];

router.post('/register', async (req, res) => {
  try {
    const result = await registerUser(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  console.log('Login request received:', req.body);
  try {
    const result = await loginUser(req.body);
    console.log('Login successful, sending response:', result);

    // Set response headers
    res.setHeader('Content-Type', 'application/json');
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Send response
    return res.status(200).json(result);
  } catch (err) {
    console.error('Login error:', err);
    return res.status(401).json({ error: err.message });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }
    const result = await refreshToken(token);
    res.json(result);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Protected route example
router.get('/me', verifyToken, async (req, res) => {
  res.json(req.user);
});

export default router;
