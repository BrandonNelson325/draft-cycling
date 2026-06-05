import { Router, json } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { analyzeRoute } from '../controllers/routesController';

const router = Router();

// GPX files arrive as a JSON body { gpx_content, filename }. A long route
// (200+ miles with per-second points + extensions) can easily run 10-20MB,
// so we override the global 100KB JSON limit on this route. The mobile
// client also strips extensions/time before sending to keep payloads small.
router.post('/analyze', authenticateJWT, json({ limit: '25mb' }), analyzeRoute);

export default router;
