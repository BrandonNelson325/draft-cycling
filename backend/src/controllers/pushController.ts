import { Response } from 'express';
import { supabaseAdmin } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

/**
 * PUT /api/push/token
 * Body: { token: string, enabled: boolean }
 */
export const registerPushToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { token, enabled } = req.body;

    if (typeof token !== 'string' || !token.startsWith('ExponentPushToken')) {
      res.status(400).json({ error: 'Invalid Expo push token' });
      return;
    }

    // Clear this push token from any OTHER athlete rows first.
    // A device token belongs to one user — if someone tested multiple accounts
    // on the same phone, the old account would still receive notifications.
    await supabaseAdmin
      .from('athletes')
      .update({ push_token: null, push_notifications_enabled: false })
      .eq('push_token', token)
      .neq('id', req.user.id);

    const { error } = await supabaseAdmin
      .from('athletes')
      .update({
        push_token: token,
        push_notifications_enabled: enabled !== false, // default true if omitted
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id);

    if (error) {
      logger.error('[Push] Failed to save push token:', error);
      res.status(500).json({ error: 'Failed to register push token' });
      return;
    }

    logger.info(`[Push] Token registered for athlete ${req.user.id}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[Push] registerPushToken error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
