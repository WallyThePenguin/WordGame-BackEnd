import express from 'express';
import gameRoutes from './routes/gameRoutes.js';
import authRoutes from './routes/authRoutes.js';
import dataRoutes from './routes/dataRoutes.js';
import friendRoutes from './routes/friendRoutes.js';
import leaderboardRoutes from './routes/leaderboardRoutes.js';


const app = express();
app.use(express.json());

app.use('/api/games', gameRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes); 
app.use('/api/friends', friendRoutes);
app.use('/api/leaderboard', leaderboardRoutes);

export default app;
