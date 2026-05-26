import { Router, json } from 'express';
import { authenticateJWT } from '../middleware/auth';
import { analyzeRoute } from '../controllers/routesController';

const router = Router();

// GPX files arrive as a JSON body { gpx_content, filename }. They can be
// hundreds of KB so we override the global 100KB JSON limit on this route.
router.post('/analyze', authenticateJWT, json({ limit: '5mb' }), analyzeRoute);

export default router;
