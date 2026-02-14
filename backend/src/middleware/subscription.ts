import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { supabaseAdmin } from '../utils/supabase';

export const checkSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get athlete subscription status
    const { data: athlete, error } = await supabaseAdmin
      .from('athletes')
      .select('subscription_status, subscription_current_period_end')
      .eq('id', req.user.id)
      .single();

    if (error) {
      console.error('Error fetching subscription status:', error);
      res.status(500).json({ error: 'Failed to verify subscription' });
      return;
    }

    // Check if subscription is active
    if (athlete?.subscription_status !== 'active' && athlete?.subscription_status !== 'trialing') {
      res.status(403).json({
        error: 'Active subscription required',
        subscription_status: athlete?.subscription_status || 'none',
      });
      return;
    }

    // Check if subscription period is still valid
    if (athlete.subscription_current_period_end) {
      const periodEnd = new Date(athlete.subscription_current_period_end);
      if (periodEnd < new Date()) {
        res.status(403).json({
          error: 'Subscription expired',
          subscription_status: 'expired',
        });
        return;
      }
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Subscription verification failed' });
  }
};
