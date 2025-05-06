import express from 'express';
import gameRoutes from './routes/gameRoutes.js';
import authRoutes from './routes/authRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';
import cors from 'cors';

const app = express();

// CORS configuration
const allowedOrigins = [
  'http://localhost:3001',
  'http://validtesting.tplinkdns.com:3001'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true, // Enable if you're using cookies/sessions
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`📥 [HTTP] ${req.method} ${req.originalUrl} ${JSON.stringify(req.body)}`);
  next();
});

app.use('/api/games', gameRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

export default app;
