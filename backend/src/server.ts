import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import betaRoutes from './routes/betaRoutes';
import stravaRoutes from './routes/stravaRoutes';
import powerRoutes from './routes/powerRoutes';
import ftpRoutes from './routes/ftpRoutes';
import trainingRoutes from './routes/trainingRoutes';
import aiCoachRoutes from './routes/aiCoachRoutes';

const app = express();

// Middleware
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/beta', betaRoutes);
app.use('/api/strava', stravaRoutes);
app.use('/api/power', powerRoutes);
app.use('/api/ftp', ftpRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/ai', aiCoachRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`🚴 AI Cycling Coach API running on port ${config.port}`);
  console.log(`📍 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
});

export default app;
