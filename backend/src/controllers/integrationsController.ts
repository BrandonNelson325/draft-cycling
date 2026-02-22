import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { intervalsIcuService } from '../services/intervalsIcuService';
import { supabaseAdmin } from '../utils/supabase';

/**
 * Intervals.icu Integration Controllers
 */

export const getIntervalsIcuAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const state = req.user.id; // Use athlete ID as state for verification
    const authUrl = intervalsIcuService.getAuthUrl(state);

    res.json({ authUrl });
  } catch (error: any) {
    console.error('Error generating Intervals.icu auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
};

export const handleIntervalsIcuCallback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing authorization code' });
      return;
    }

    if (!state || typeof state !== 'string') {
      res.status(400).json({ error: 'Missing state parameter' });
      return;
    }

    // Exchange code for tokens
    await intervalsIcuService.handleCallback(code, state);

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/settings?intervals_icu=connected`);
  } catch (error: any) {
    console.error('Intervals.icu callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings?intervals_icu=error`);
  }
};

export const disconnectIntervalsIcu = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await intervalsIcuService.disconnect(req.user.id);

    res.json({ success: true, message: 'Intervals.icu disconnected' });
  } catch (error: any) {
    console.error('Error disconnecting Intervals.icu:', error);
    res.status(500).json({ error: 'Failed to disconnect Intervals.icu' });
  }
};

export const getIntervalsIcuStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('intervals_icu_athlete_id, intervals_icu_auto_sync, intervals_icu_token_expires_at')
      .eq('id', req.user.id)
      .single();

    const isConnected = !!athlete?.intervals_icu_athlete_id;

    res.json({
      connected: isConnected,
      athlete_id: athlete?.intervals_icu_athlete_id,
      auto_sync: athlete?.intervals_icu_auto_sync || false,
      token_expires_at: athlete?.intervals_icu_token_expires_at,
    });
  } catch (error: any) {
    console.error('Error getting Intervals.icu status:', error);
    res.status(500).json({ error: 'Failed to get integration status' });
  }
};

export const syncWorkoutToIntervalsIcu = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { workout_id, scheduled_date, calendar_entry_id } = req.body;

    if (!workout_id || !scheduled_date) {
      res.status(400).json({ error: 'workout_id and scheduled_date are required' });
      return;
    }

    const eventId = await intervalsIcuService.uploadWorkout(
      req.user.id,
      workout_id,
      new Date(scheduled_date),
      calendar_entry_id
    );

    res.json({
      success: true,
      message: 'Workout synced to Intervals.icu',
      external_id: eventId,
    });
  } catch (error: any) {
    console.error('Error syncing workout:', error);
    res.status(500).json({ error: error.message || 'Failed to sync workout' });
  }
};

export const updateIntervalsIcuSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { auto_sync } = req.body;

    if (typeof auto_sync !== 'boolean') {
      res.status(400).json({ error: 'auto_sync must be a boolean' });
      return;
    }

    const { error } = await supabaseAdmin
      .from('athletes')
      .update({ intervals_icu_auto_sync: auto_sync })
      .eq('id', req.user.id);

    if (error) {
      throw new Error(`Failed to update settings: ${error.message}`);
    }

    res.json({ success: true, auto_sync });
  } catch (error: any) {
    console.error('Error updating Intervals.icu settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
