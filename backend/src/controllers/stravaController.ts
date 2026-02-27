import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { stravaClient } from '../utils/strava';
import { stravaService } from '../services/stravaService';
import { ftpEstimationService } from '../services/ftpEstimationService';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export const getAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const isMobile = req.query.mobile === 'true';

    // Generate a random state for CSRF protection
    // Embed mobile flag in state so callback knows which redirect to use
    const state = crypto.randomBytes(16).toString('hex') + (isMobile ? ':mobile' : '');

    let authUrl: string;
    if (isMobile && process.env.STRAVA_MOBILE_REDIRECT_URI) {
      // Build auth URL using mobile redirect URI
      const params = new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID || '',
        redirect_uri: process.env.STRAVA_MOBILE_REDIRECT_URI,
        response_type: 'code',
        approval_prompt: 'auto',
        scope: 'read,activity:read_all,profile:read_all',
        state,
      });
      authUrl = `https://www.strava.com/oauth/authorize?${params.toString()}`;
    } else {
      authUrl = stravaClient.getAuthorizationUrl(state);
    }

    res.json({ auth_url: authUrl, state });
  } catch (error) {
    logger.error('Get auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
};

export const handleCallback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, scope, error } = req.query;

    if (error) {
      res.redirect(`${process.env.FRONTEND_URL}?strava_error=${error}`);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    // Exchange code for tokens
    const tokenData = await stravaClient.exchangeToken(code);

    // Get user ID from state or from token response
    // For now, we'll need to handle this differently - the user needs to be identified
    // We can use a session or pass the user ID in the state parameter

    // TODO: For now, this is a placeholder. We need to implement proper state management
    // to associate the callback with a specific user session

    const isMobile = typeof state === 'string' && state.includes(':mobile');
    const redirectParams =
      `access_token=${tokenData.access_token}&` +
      `refresh_token=${tokenData.refresh_token}&` +
      `expires_at=${tokenData.expires_at}&` +
      `athlete_id=${tokenData.athlete.id}`;

    if (isMobile && process.env.STRAVA_MOBILE_REDIRECT_URI) {
      res.redirect(`${process.env.STRAVA_MOBILE_REDIRECT_URI}?${redirectParams}`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/strava/callback?${redirectParams}`);
    }
  } catch (error) {
    logger.error('Strava callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}?strava_error=callback_failed`);
  }
};

export const connectStrava = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { access_token, refresh_token, expires_at, athlete_id } = req.body;

    if (!access_token || !refresh_token || !expires_at || !athlete_id) {
      res.status(400).json({ error: 'Missing required Strava data' });
      return;
    }

    // Update athlete with Strava tokens
    const { data: athlete, error } = await supabaseAdmin
      .from('athletes')
      .update({
        strava_athlete_id: athlete_id,
        strava_access_token: access_token,
        strava_refresh_token: refresh_token,
        strava_token_expires_at: new Date(expires_at * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      logger.error('Error connecting Strava:', error);
      res.status(500).json({ error: 'Failed to connect Strava' });
      return;
    }

    // Start initial sync in background
    stravaService
      .syncActivities(req.user.id, {
        // Sync last 6 weeks
        after: new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000),
      })
      .then(async (result) => {
        logger.debug(`Initial Strava sync for ${req.user!.id}: ${result.synced} activities`);

        // Auto-update FTP after sync
        if (result.analyzed > 0) {
          await ftpEstimationService.autoUpdateFTP(req.user!.id);
        }
      })
      .catch((err) => {
        logger.error('Initial sync error:', err);
      });

    res.json({
      message: 'Strava connected successfully',
      athlete,
    });
  } catch (error) {
    logger.error('Connect Strava error:', error);
    res.status(500).json({ error: 'Failed to connect Strava' });
  }
};

export const disconnectStrava = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('athletes')
      .update({
        strava_athlete_id: null,
        strava_access_token: null,
        strava_refresh_token: null,
        strava_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id);

    if (error) {
      logger.error('Error disconnecting Strava:', error);
      res.status(500).json({ error: 'Failed to disconnect Strava' });
      return;
    }

    res.json({ message: 'Strava disconnected successfully' });
  } catch (error) {
    logger.error('Disconnect Strava error:', error);
    res.status(500).json({ error: 'Failed to disconnect Strava' });
  }
};

export const syncActivities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    logger.debug(`Starting Strava sync for athlete ${req.user.id}...`);

    const result = await stravaService.syncActivities(req.user.id, {
      after: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      before: new Date(Date.now() + 24 * 60 * 60 * 1000), // Include today + tomorrow to catch recent activities
    });

    logger.debug(`Sync complete: ${result.synced}/${result.total} activities stored, ${result.analyzed} analyzed`);

    // Auto-update FTP after manual sync
    if (result.analyzed > 0) {
      await ftpEstimationService.autoUpdateFTP(req.user.id);
    }

    res.json(result);
  } catch (error: any) {
    logger.error('Sync activities error:', error);
    res.status(500).json({ error: error.message || 'Failed to sync activities' });
  }
};

export const getActivities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: activities, error } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', req.user.id)
      .order('start_date', { ascending: false })
      .limit(50);

    if (error) {
      logger.error('Error fetching activities:', error);
      res.status(500).json({ error: 'Failed to fetch activities' });
      return;
    }

    // Map database field names to frontend-expected names
    const mappedActivities = (activities || []).map((activity: any) => ({
      ...activity,
      distance: activity.distance_meters, // Map distance_meters → distance
      moving_time: activity.moving_time_seconds, // Map moving_time_seconds → moving_time
    }));

    res.json({ activities: mappedActivities });
  } catch (error) {
    logger.error('Get activities error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
};

export const getConnectionStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('strava_athlete_id, strava_token_expires_at')
      .eq('id', req.user.id)
      .single();

    res.json({
      connected: !!athlete?.strava_athlete_id,
      strava_athlete_id: athlete?.strava_athlete_id,
      token_expires_at: athlete?.strava_token_expires_at,
    });
  } catch (error) {
    logger.error('Get connection status error:', error);
    res.status(500).json({ error: 'Failed to get connection status' });
  }
};
