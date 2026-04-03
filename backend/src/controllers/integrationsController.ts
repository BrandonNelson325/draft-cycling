import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { intervalsIcuService } from '../services/intervalsIcuService';
import { wahooService } from '../services/wahooService';
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

    const mobile = req.query.mobile === 'true';
    const state = mobile ? `${req.user.id}:mobile` : req.user.id;
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

    // Parse mobile flag from state
    const isMobile = state.includes(':mobile');
    const athleteId = state.replace(':mobile', '');

    // Exchange code for tokens
    console.log(`[Intervals.icu] Callback received: code=${code?.slice(0, 8)}..., athleteId=${athleteId}, mobile=${isMobile}`);
    await intervalsIcuService.handleCallback(code, athleteId);

    // Redirect back to app
    if (isMobile) {
      res.redirect(`cyclingcoach://intervals-icu/callback?status=connected`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/settings?intervals_icu=connected`);
    }
  } catch (error: any) {
    console.error('[Intervals.icu] Callback error:', error.message || error);
    const isMobile = (req.query.state as string)?.includes(':mobile');
    if (isMobile) {
      res.redirect(`cyclingcoach://intervals-icu/callback?status=error`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/settings?intervals_icu=error`);
    }
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
      .select('intervals_icu_athlete_id, intervals_icu_access_token, intervals_icu_auto_sync, intervals_icu_token_expires_at')
      .eq('id', req.user.id)
      .single();

    const isConnected = !!athlete?.intervals_icu_access_token;

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

export const syncAllToIntervalsIcu = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Get all future calendar entries with workouts that haven't been synced to Intervals.icu
    const { data: entries, error } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, workout_id, scheduled_date, workouts(name)')
      .eq('athlete_id', req.user.id)
      .eq('completed', false)
      .gte('scheduled_date', today)
      .not('workout_id', 'is', null);

    if (error) {
      throw new Error(`Failed to fetch calendar entries: ${error.message}`);
    }

    if (!entries || entries.length === 0) {
      res.json({ success: true, synced: 0, message: 'No future workouts to sync' });
      return;
    }

    // Check which ones are already synced
    const { data: existingSyncs } = await supabaseAdmin
      .from('workout_syncs')
      .select('calendar_entry_id')
      .eq('athlete_id', req.user.id)
      .eq('integration', 'intervals_icu')
      .eq('sync_status', 'synced')
      .in('calendar_entry_id', entries.map(e => e.id));

    const alreadySynced = new Set((existingSyncs || []).map(s => s.calendar_entry_id));
    const toSync = entries.filter(e => !alreadySynced.has(e.id));

    let synced = 0;
    let failed = 0;

    for (const entry of toSync) {
      try {
        await intervalsIcuService.uploadWorkout(
          req.user.id,
          entry.workout_id,
          new Date(entry.scheduled_date + 'T12:00:00'),
          entry.id
        );
        synced++;
      } catch (err: any) {
        console.error(`Failed to sync entry ${entry.id}:`, err.message);
        failed++;
      }
    }

    res.json({
      success: true,
      synced,
      failed,
      skipped: alreadySynced.size,
      message: `Synced ${synced} workout${synced !== 1 ? 's' : ''} to Intervals.icu${failed ? `, ${failed} failed` : ''}`,
    });
  } catch (error: any) {
    console.error('Error bulk syncing to Intervals.icu:', error);
    res.status(500).json({ error: error.message || 'Failed to sync workouts' });
  }
};

/**
 * Wahoo Integration Controllers
 */

export const getWahooAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const state = req.user.id;
    const mobile = req.query.mobile === 'true';
    const authUrl = wahooService.getAuthUrl(state, mobile);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Error generating Wahoo auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
};

export const handleWahooCallback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== 'string') { res.status(400).json({ error: 'Missing authorization code' }); return; }
    if (!state || typeof state !== 'string') { res.status(400).json({ error: 'Missing state parameter' }); return; }
    const isMobile = state.includes(':mobile');
    const athleteId = state.replace(':mobile', '');
    await wahooService.handleCallback(code, athleteId);
    if (isMobile) {
      res.redirect(`cyclingcoach://wahoo/callback?status=connected`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/settings?wahoo=connected`);
    }
  } catch (error: any) {
    console.error('Wahoo callback error:', error);
    const isMobile = (req.query.state as string)?.includes(':mobile');
    if (isMobile) {
      res.redirect(`cyclingcoach://wahoo/callback?status=error`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/settings?wahoo=error`);
    }
  }
};

export const disconnectWahoo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await wahooService.disconnect(req.user.id);
    res.json({ success: true, message: 'Wahoo disconnected' });
  } catch (error: any) {
    console.error('Error disconnecting Wahoo:', error);
    res.status(500).json({ error: 'Failed to disconnect Wahoo' });
  }
};

export const getWahooStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_user_id, wahoo_access_token, wahoo_auto_sync, wahoo_token_expires_at')
      .eq('id', req.user.id)
      .single();
    res.json({
      connected: !!athlete?.wahoo_access_token,
      user_id: athlete?.wahoo_user_id,
      auto_sync: athlete?.wahoo_auto_sync || false,
      token_expires_at: athlete?.wahoo_token_expires_at,
    });
  } catch (error: any) {
    console.error('Error getting Wahoo status:', error);
    res.status(500).json({ error: 'Failed to get integration status' });
  }
};

export const syncWorkoutToWahoo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { workout_id, scheduled_date, calendar_entry_id } = req.body;
    if (!workout_id || !scheduled_date) { res.status(400).json({ error: 'workout_id and scheduled_date are required' }); return; }
    const externalId = await wahooService.uploadWorkout(req.user.id, workout_id, new Date(scheduled_date), calendar_entry_id);
    res.json({ success: true, message: 'Workout synced to Wahoo', external_id: externalId });
  } catch (error: any) {
    console.error('Error syncing workout to Wahoo:', error);
    res.status(500).json({ error: error.message || 'Failed to sync workout' });
  }
};

export const updateWahooSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { auto_sync } = req.body;
    if (typeof auto_sync !== 'boolean') { res.status(400).json({ error: 'auto_sync must be a boolean' }); return; }
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({ wahoo_auto_sync: auto_sync })
      .eq('id', req.user.id);
    if (error) throw new Error(`Failed to update settings: ${error.message}`);
    res.json({ success: true, auto_sync });
  } catch (error: any) {
    console.error('Error updating Wahoo settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
