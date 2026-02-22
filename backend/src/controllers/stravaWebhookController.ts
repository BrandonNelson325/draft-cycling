import { Request, Response } from 'express';
import { config } from '../config';
import { stravaClient } from '../utils/strava';
import { stravaService } from '../services/stravaService';
import { powerAnalysisService } from '../services/powerAnalysisService';
import { ftpEstimationService } from '../services/ftpEstimationService';
import { trainingLoadService } from '../services/trainingLoadService';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

// Webhook verification token (should be in env)
const WEBHOOK_VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || 'cycling_coach_webhook_2026';

/**
 * Webhook subscription verification (GET request from Strava)
 * Strava sends this when creating the subscription to verify the callback URL
 */
export const verifyWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    logger.debug('Webhook verification request:', { mode, token, challenge });

    // Verify the token matches
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      logger.debug('Webhook verified successfully');
      // Respond with the challenge to complete verification
      res.json({ 'hub.challenge': challenge });
    } else {
      logger.debug('Webhook verification failed');
      res.status(403).json({ error: 'Verification failed' });
    }
  } catch (error) {
    logger.error('Webhook verification error:', error);
    res.status(500).json({ error: 'Verification error' });
  }
};

/**
 * Handle webhook events (POST request from Strava)
 * Strava sends these when activities are created, updated, or deleted
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    // Acknowledge receipt immediately
    res.status(200).json({ status: 'received' });

    const event = req.body;
    logger.debug('Webhook event received:', JSON.stringify(event, null, 2));

    // Event structure:
    // {
    //   "object_type": "activity",
    //   "object_id": 12345678,
    //   "aspect_type": "create|update|delete",
    //   "owner_id": 123456,
    //   "subscription_id": 123,
    //   "event_time": 1549560669
    // }

    // Only process activity events
    if (event.object_type !== 'activity') {
      logger.debug('Ignoring non-activity event');
      return;
    }

    // Find athlete by Strava athlete ID
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('id, strava_athlete_id, ftp')
      .eq('strava_athlete_id', event.owner_id)
      .single();

    if (!athlete) {
      logger.debug(`No athlete found for Strava ID: ${event.owner_id}`);
      return;
    }

    // Process based on event type
    switch (event.aspect_type) {
      case 'create':
        await handleActivityCreated(athlete.id, event.object_id);
        break;

      case 'update':
        await handleActivityUpdated(athlete.id, event.object_id);
        break;

      case 'delete':
        await handleActivityDeleted(athlete.id, event.object_id);
        break;

      default:
        logger.debug(`Unknown aspect type: ${event.aspect_type}`);
    }
  } catch (error) {
    logger.error('Webhook handling error:', error);
    // Don't send error response - already sent 200
  }
};

/**
 * Handle new activity creation
 */
async function handleActivityCreated(athleteId: string, stravaActivityId: number) {
  try {
    logger.debug(`Processing new activity: ${stravaActivityId} for athlete: ${athleteId}`);

    // Get activity details from Strava
    const accessToken = await stravaService.ensureValidToken(athleteId);
    const activity: any = await stravaClient.getActivity(accessToken, stravaActivityId);

    // Only process rides
    if (activity.sport_type !== 'Ride' && activity.type !== 'Ride' && activity.type !== 'VirtualRide') {
      logger.debug(`Skipping non-ride activity: ${activity.type}`);
      return;
    }

    // Store activity
    await supabaseAdmin
      .from('strava_activities')
      .insert({
        athlete_id: athleteId,
        strava_activity_id: stravaActivityId,
        name: activity.name,
        start_date: activity.start_date,
        distance_meters: Math.round(activity.distance),
        moving_time_seconds: activity.moving_time,
        average_watts: activity.average_watts || null,
        raw_data: activity,
        synced_at: new Date().toISOString(),
      });

    logger.debug(`Stored activity: ${stravaActivityId}`);

    // Analyze power curve if has power data
    if (activity.device_watts || activity.average_watts) {
      logger.debug(`Analyzing power curve for activity: ${stravaActivityId}`);
      await powerAnalysisService.analyzePowerCurve(athleteId, stravaActivityId);

      // Update FTP estimation
      logger.debug(`Updating FTP estimation for athlete: ${athleteId}`);
      await ftpEstimationService.autoUpdateFTP(athleteId);

      // Update training status
      logger.debug(`Updating training status for athlete: ${athleteId}`);
      await trainingLoadService.getTrainingStatus(athleteId);
    }

    logger.debug(`✅ Successfully processed new activity: ${stravaActivityId}`);
  } catch (error) {
    logger.error(`Error handling activity creation:`, error);
  }
}

/**
 * Handle activity update
 */
async function handleActivityUpdated(athleteId: string, stravaActivityId: number) {
  try {
    logger.debug(`Processing updated activity: ${stravaActivityId}`);

    // Re-fetch and update activity
    const accessToken = await stravaService.ensureValidToken(athleteId);
    const activity: any = await stravaClient.getActivity(accessToken, stravaActivityId);

    // Update in database
    await supabaseAdmin
      .from('strava_activities')
      .update({
        name: activity.name,
        distance_meters: Math.round(activity.distance),
        moving_time_seconds: activity.moving_time,
        average_watts: activity.average_watts || null,
        raw_data: activity,
        synced_at: new Date().toISOString(),
      })
      .eq('strava_activity_id', stravaActivityId)
      .eq('athlete_id', athleteId);

    // Re-analyze if has power data
    if (activity.device_watts || activity.average_watts) {
      await powerAnalysisService.analyzePowerCurve(athleteId, stravaActivityId);
    }

    logger.debug(`✅ Successfully updated activity: ${stravaActivityId}`);
  } catch (error) {
    logger.error(`Error handling activity update:`, error);
  }
}

/**
 * Handle activity deletion
 */
async function handleActivityDeleted(athleteId: string, stravaActivityId: number) {
  try {
    logger.debug(`Deleting activity: ${stravaActivityId}`);

    // Delete from database (cascades to power_curves via foreign key)
    await supabaseAdmin
      .from('strava_activities')
      .delete()
      .eq('strava_activity_id', stravaActivityId)
      .eq('athlete_id', athleteId);

    logger.debug(`✅ Successfully deleted activity: ${stravaActivityId}`);
  } catch (error) {
    logger.error(`Error handling activity deletion:`, error);
  }
}

/**
 * Create webhook subscription (admin only)
 */
export const createSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    // This should be protected - only admins can create subscriptions
    // For now, we'll allow it but you should add admin auth

    const callbackUrl = `${req.protocol}://${req.get('host')}/api/strava/webhook`;

    logger.debug('Creating webhook subscription:', callbackUrl);

    const subscription = await stravaClient.createWebhookSubscription(
      callbackUrl,
      WEBHOOK_VERIFY_TOKEN
    );

    logger.debug('Webhook subscription created:', subscription);

    res.json({
      message: 'Webhook subscription created',
      subscription,
    });
  } catch (error: any) {
    logger.error('Error creating webhook subscription:', error);
    res.status(500).json({
      error: error.message || 'Failed to create webhook subscription',
    });
  }
};

/**
 * View webhook subscription (admin only)
 */
export const viewSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const subscription = await stravaClient.viewWebhookSubscription();

    res.json({ subscription });
  } catch (error: any) {
    logger.error('Error viewing webhook subscription:', error);
    res.status(500).json({
      error: error.message || 'Failed to view webhook subscription',
    });
  }
};

/**
 * Delete webhook subscription (admin only)
 */
export const deleteSubscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subscriptionId } = req.params;

    if (!subscriptionId || Array.isArray(subscriptionId)) {
      res.status(400).json({ error: 'Valid subscription ID required' });
      return;
    }

    await stravaClient.deleteWebhookSubscription(parseInt(subscriptionId, 10));

    res.json({ message: 'Webhook subscription deleted' });
  } catch (error: any) {
    logger.error('Error deleting webhook subscription:', error);
    res.status(500).json({
      error: error.message || 'Failed to delete webhook subscription',
    });
  }
};
