import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { routeAnalyzerService } from '../services/routeAnalyzerService';
import { logger } from '../utils/logger';

export const analyzeRoute = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { gpx_content, filename } = req.body as { gpx_content?: string; filename?: string };

    if (!gpx_content || typeof gpx_content !== 'string') {
      res.status(400).json({ error: 'gpx_content (string) is required' });
      return;
    }
    if (gpx_content.length > 25 * 1024 * 1024) {
      res.status(413).json({ error: 'GPX file too large (max 25MB)' });
      return;
    }
    if (!gpx_content.includes('<gpx')) {
      res.status(400).json({ error: 'Content does not look like a GPX file' });
      return;
    }

    const analysis = await routeAnalyzerService.analyzeGpx(gpx_content, filename);
    res.json(analysis);
  } catch (error: any) {
    logger.warn('Route analysis failed:', error.message);
    res.status(400).json({ error: error.message || 'Failed to analyze route' });
  }
};
