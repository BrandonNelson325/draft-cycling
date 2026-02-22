import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { weeklyMetricsService } from '../services/weeklyMetricsService';

export const chartsController = {
  async getWeeklyData(req: AuthRequest, res: Response) {
    try {
      const athleteId = req.user?.id;
      if (!athleteId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const weeks = parseInt(req.query.weeks as string) || 6;
      const data = await weeklyMetricsService.getWeeklyData(athleteId, weeks);

      res.json(data);
    } catch (error) {
      console.error('Failed to fetch weekly data:', error);
      res.status(500).json({ error: 'Failed to fetch weekly data' });
    }
  },

  async getFitnessTimeSeries(req: AuthRequest, res: Response) {
    try {
      const athleteId = req.user?.id;
      if (!athleteId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const days = parseInt(req.query.days as string) || 42;
      const data = await weeklyMetricsService.getFitnessTimeSeries(athleteId, days);

      res.json(data);
    } catch (error) {
      console.error('Failed to fetch fitness time series:', error);
      res.status(500).json({ error: 'Failed to fetch fitness time series' });
    }
  },

  async getPowerZoneDistribution(req: AuthRequest, res: Response) {
    try {
      const athleteId = req.user?.id;
      if (!athleteId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const days = parseInt(req.query.days as string) || 30;
      const data = await weeklyMetricsService.getPowerZoneDistribution(athleteId, days);

      res.json(data);
    } catch (error) {
      console.error('Failed to fetch power zone distribution:', error);
      res.status(500).json({ error: 'Failed to fetch power zone distribution' });
    }
  },
};
