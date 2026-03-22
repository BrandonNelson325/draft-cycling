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
import activityFeedbackRoutes from './routes/activityFeedbackRoutes';
import pushRoutes from './routes/push';
import subscriptionRoutes from './routes/subscriptionRoutes';
import { warmJwksCache } from './middleware/auth';
import { supabaseAdmin } from './utils/supabase';
import { stravaCronService } from './services/stravaCronService';
import { startMorningCheckInCron } from './services/morningCheckInCronService';
import { startActivityReminderCron } from './services/activityReminderCronService';

// Catch unhandled errors so background tasks (crons, fire-and-forget) don't crash the server
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

const app = express();

// Disable ETags — they cause 304 responses on mobile where there's no persistent cache,
// resulting in empty data on fresh app opens
app.set('etag', false);

// Prevent ALL caching on API responses — Railway edge, CDN, and mobile HTTP layers
// must never serve stale or empty responses
app.use('/api/', (_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  next();
});

// Trust Railway's reverse proxy so express-rate-limit can read the real client IP
app.set('trust proxy', 1);

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production',
  crossOriginEmbedderPolicy: config.nodeEnv === 'production',
}));

// Rate Limiting
// IMPORTANT: Rate limiters run BEFORE route-level auth middleware, so req.user is not available.
// We extract the user ID directly from the JWT in the Authorization header for per-user limiting.
const keyGenerator = (req: any) => {
  try {
    const authHeader = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.sub) return payload.sub; // Supabase JWT user ID
    }
  } catch {}
  return req.ip || 'unknown';
};

const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 2000,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 auth requests per 15 min per IP — generous because mobile retries
  message: { error: 'Too many auth requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/', authLimiter);

// Skip rate limiting for critical one-time actions that must never fail
const skipRateLimitPaths = ['/api/subscription/redeem', '/api/beta/activate', '/api/subscription/webhook', '/api/auth/profile', '/api/auth/refresh'];
app.use('/api/', (req: any, res: any, next: any) => {
  if (skipRateLimitPaths.some(p => req.path === p || req.originalUrl?.includes(p))) {
    return next();
  }
  return generalLimiter(req, res, next);
});

// Stripe webhook needs raw body for signature verification — must come before CORS/json parser
app.post('/api/subscription/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
  (req as any).rawBody = req.body;
  next();
});

// CORS Configuration
const buildAllowedOrigins = (): string[] => {
  const origins = new Set<string>();

  // Add configured frontend URL (strip trailing slash)
  const frontendUrl = config.frontendUrl.replace(/\/+$/, '');
  origins.add(frontendUrl);

  // Support both www and non-www variants
  if (frontendUrl.includes('://www.')) {
    origins.add(frontendUrl.replace('://www.', '://'));
  } else if (frontendUrl.startsWith('https://')) {
    origins.add(frontendUrl.replace('https://', 'https://www.'));
  }

  // Additional allowed origins from env (comma-separated)
  if (process.env.CORS_EXTRA_ORIGINS) {
    for (const o of process.env.CORS_EXTRA_ORIGINS.split(',')) {
      const trimmed = o.trim().replace(/\/+$/, '');
      if (trimmed) origins.add(trimmed);
    }
  }

  // Local development
  origins.add('http://localhost:5173');
  origins.add('http://localhost:3000');
  origins.add('http://localhost:4173'); // vite preview

  return Array.from(origins);
};

const allowedOrigins = buildAllowedOrigins();
logger.info(`[CORS] Allowed origins: ${JSON.stringify(allowedOrigins)}`);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logger.warn(`[CORS] Blocked origin: "${origin}" — allowed: ${JSON.stringify(allowedOrigins)}`);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Body Parser
app.use(express.json());

// Health check with diagnostics
app.get('/health', async (req, res) => {
  const mem = process.memoryUsage();
  const uptimeSeconds = process.uptime();

  // Test Supabase connectivity
  let dbOk = false;
  let dbError = '';
  try {
    const { data, error } = await supabaseAdmin.from('athletes').select('id').limit(1);
    dbOk = !error;
    if (error) dbError = error.message;
  } catch (e: any) {
    dbError = e.message;
  }

  const status = dbOk ? 'ok' : 'degraded';
  const httpStatus = dbOk ? 200 : 503;

  res.status(httpStatus).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    memory: {
      rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
    },
    db: dbOk ? 'connected' : `ERROR: ${dbError}`,
  });
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
app.use('/api/activities', activityFeedbackRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/subscription', subscriptionRoutes);

// Error handler (must be last)
app.use(errorHandler);

// Start server — warm JWKS cache before accepting traffic
app.listen(config.port, async () => {
  logger.info(`🚴 AI Cycling Coach API running on port ${config.port}`);
  logger.info(`📍 Environment: ${config.nodeEnv}`);
  logger.info(`🌐 Frontend URL: ${config.frontendUrl}`);

  // Pre-warm JWKS cache so the first ES256 request doesn't trigger a cold fetch
  await warmJwksCache();

  // Start Strava auto-sync cron job
  stravaCronService.start();

  // Start morning check-in cron (runs every minute, fires push at configured time)
  startMorningCheckInCron();

  // Start activity feedback reminder cron (runs every 5 minutes)
  startActivityReminderCron();

  // Self-monitoring: log health every 10 minutes to catch degradation
  setInterval(async () => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    const rssMB = Math.round(mem.rss / 1024 / 1024);

    // Test DB connectivity
    try {
      const start = Date.now();
      const { error } = await supabaseAdmin.from('athletes').select('id').limit(1);
      const dbMs = Date.now() - start;

      if (error) {
        logger.error(`[HEALTH] DB ERROR after ${dbMs}ms: ${error.message} | Memory: heap=${heapMB}MB rss=${rssMB}MB`);
      } else if (dbMs > 2000) {
        logger.warn(`[HEALTH] DB SLOW: ${dbMs}ms | Memory: heap=${heapMB}MB rss=${rssMB}MB`);
      } else {
        logger.debug(`[HEALTH] OK: db=${dbMs}ms heap=${heapMB}MB rss=${rssMB}MB uptime=${Math.floor(process.uptime() / 60)}min`);
      }
    } catch (e: any) {
      logger.error(`[HEALTH] DB EXCEPTION: ${e.message} | Memory: heap=${heapMB}MB rss=${rssMB}MB`);
    }

    // Warn if memory is getting high (Railway free tier is 512MB, pro is 8GB)
    if (rssMB > 400) {
      logger.warn(`[HEALTH] HIGH MEMORY: rss=${rssMB}MB heap=${heapMB}MB — may need restart`);
    }
  }, 10 * 60 * 1000); // Every 10 minutes
});

export default app;
