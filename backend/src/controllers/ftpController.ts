import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { ftpEstimationService } from '../services/ftpEstimationService';

export const getEstimatedFTP = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const estimation = await ftpEstimationService.estimateFTP(req.user.id);

    if (!estimation) {
      res.json({
        estimated_ftp: 0,
        confidence: 0,
        based_on_rides: 0,
        last_updated: new Date().toISOString(),
      });
      return;
    }

    // Convert confidence to number (0-1)
    const confidenceMap = { low: 0.5, medium: 0.7, high: 0.9 };
    const confidenceNum = confidenceMap[estimation.confidence];

    res.json({
      estimated_ftp: estimation.estimated_ftp,
      confidence: confidenceNum,
      based_on_rides: estimation.activity_count,
      last_updated: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Get estimated FTP error:', error);
    res.status(500).json({ error: 'Failed to estimate FTP' });
  }
};

export const updateFTPFromEstimation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const updated = await ftpEstimationService.autoUpdateFTP(req.user.id);

    if (updated) {
      res.json({ message: 'FTP updated successfully' });
    } else {
      res.json({ message: 'FTP not updated (insufficient confidence or no change needed)' });
    }
  } catch (error) {
    console.error('Update FTP error:', error);
    res.status(500).json({ error: 'Failed to update FTP' });
  }
};

export const getFTPHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const weeks = req.query.weeks ? parseInt(req.query.weeks as string, 10) : 12;

    const history = await ftpEstimationService.getFTPHistory(req.user.id, weeks);

    if (!history) {
      res.json({
        message: 'No FTP history available',
        history: null,
      });
      return;
    }

    res.json({ history });
  } catch (error) {
    console.error('Get FTP history error:', error);
    res.status(500).json({ error: 'Failed to get FTP history' });
  }
};
