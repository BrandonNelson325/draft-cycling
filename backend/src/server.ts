import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';
import authRoutes from './routes/authRoutes';
import betaRoutes from './routes/betaRoutes';
import stravaRoutes from './routes/stravaRoutes';
import powerRoutes from './routes/powerRoutes';
import ftpRoutes from './routes/ftpRoutes';
import trainingRoutes from './routes/trainingRoutes';
import metricsRoutes from './routes/metricsRoutes';
import aiCoachRoutes from './routes/aiCoachRoutes';
import workoutRoutes from './routes/workoutRoutes';
import calendarRoutes from './routes/calendarRoutes';
import chartsRoutes from './routes/chartsRoutes';
import integrationsRoutes from './routes/integrationsRoutes';
import dailyAnalysisRoutes from './routes/dailyAnalysisRoutes';
import trainingPlanRoutes from './routes/trainingPlanRoutes';
import dailyCheckInRoutes from './routes/dailyCheckInRoutes';
import { stravaCronService } from './services/stravaCronService';

const app = express();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production',
  crossOriginEmbedderPolicy: config.nodeEnv === 'production',
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// CORS Configuration
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));

// Body Parser
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
app.use('/api/metrics', metricsRoutes);
app.use('/api/ai', aiCoachRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/charts', chartsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/daily-analysis', dailyAnalysisRoutes);
app.use('/api/training-plans', trainingPlanRoutes);
app.use('/api/daily-check-in', dailyCheckInRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  logger.info(`🚴 AI Cycling Coach API running on port ${config.port}`);
  logger.info(`📍 Environment: ${config.nodeEnv}`);
  logger.info(`🌐 Frontend URL: ${config.frontendUrl}`);

  // Start Strava auto-sync cron job
  stravaCronService.start();
});

export default app;
