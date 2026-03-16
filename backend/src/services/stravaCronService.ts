import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { stravaService } from './stravaService';
import { ftpEstimationService } from './ftpEstimationService';
import { sendRideCompletedNotification } from './pushNotificationService';
import { logger } from '../utils/logger';

export class StravaCronService {
  private cronJob: any = null;

  /**
   * Start the cron job to sync Strava activities every 15 minutes
   */
  start() {
    // Run every 15 minutes: "*/15 * * * *"
    // Format: minute hour day month dayOfWeek
    this.cronJob = cron.schedule('*/15 * * * *', async () => {
      logger.debug('\n🔄 [Strava Cron] Starting automatic sync (runs every 15 minutes)...');
      await this.syncAllConnectedAthletes();
    });

    logger.debug('✅ Strava cron job started - will sync every 15 minutes');
    logger.debug('   → Syncs activities from the last 24 hours for all connected athletes');
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.debug('❌ Strava cron job stopped');
    }
  }

  /**
   * Manually trigger a sync (for testing)
   */
  async triggerManualSync() {
    logger.debug('\n🔄 [Manual Trigger] Starting sync...');
    await this.syncAllConnectedAthletes();
  }

  /**
   * Sync activities for all athletes who have Strava connected
   */
  private async syncAllConnectedAthletes() {
    try {
      // Get all athletes with Strava connected
      const { data: athletes, error } = await supabaseAdmin
        .from('athletes')
        .select('id, full_name, strava_athlete_id')
        .not('strava_athlete_id', 'is', null);

      if (error) {
        logger.error('❌ [Strava Cron] Error fetching athletes:', error);
        return;
      }

      if (!athletes || athletes.length === 0) {
        logger.debug('   ℹ️  No athletes with Strava connected');
        return;
      }

      logger.debug(`   📊 Found ${athletes.length} athlete(s) with Strava connected`);

      // Sync each athlete
      for (const athlete of athletes) {
        await this.syncAthlete(athlete.id, athlete.full_name || 'Unknown');
      }

      logger.debug('✅ [Strava Cron] Automatic sync complete\n');
    } catch (error) {
      logger.error('❌ [Strava Cron] Fatal error during sync:', error);
    }
  }

  /**
   * Sync activities for a single athlete
   */
  private async syncAthlete(athleteId: string, athleteName: string) {
    try {
      logger.debug(`   → Syncing ${athleteName}...`);

      // Sync activities from the last 24 hours to catch all recently finished rides
      // This accounts for long endurance rides (e.g., 6+ hour rides)
      // Duplicates are automatically handled by the sync service
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const now = new Date();

      const result = await stravaService.syncActivities(athleteId, {
        after: twentyFourHoursAgo,
        before: now,
      });

      if (result.synced > 0) {
        logger.debug(`     ✅ ${athleteName}: ${result.synced} new activity(ies), ${result.analyzed} analyzed`);

        // Auto-update FTP if power data was analyzed
        if (result.analyzed > 0) {
          try {
            await ftpEstimationService.autoUpdateFTP(athleteId);
            logger.debug(`     🎯 FTP auto-updated for ${athleteName}`);
          } catch (ftpError) {
            logger.error(`     ⚠️  FTP update failed for ${athleteName}:`, ftpError);
          }
        }

        // Send push notification (once per sync batch, tracks per-activity)
        if (result.newIds && result.newIds.length > 0) {
          try {
            // result.newIds are strava_activity_ids — look up DB row UUIDs
            const { data: rows } = await supabaseAdmin
              .from('strava_activities')
              .select('id')
              .eq('athlete_id', athleteId)
              .in('strava_activity_id', result.newIds);
            const dbIds = (rows || []).map(r => r.id);
            if (dbIds.length > 0) {
              await sendRideCompletedNotification(athleteId, dbIds);
            }
          } catch (pushErr) {
            logger.error(`     ⚠️  Push notification failed for ${athleteName}:`, pushErr);
          }
        }
      } else {
        logger.debug(`     ℹ️  ${athleteName}: No new activities`);
      }
    } catch (error: any) {
      logger.error(`     ❌ Error syncing ${athleteName}:`, error.message);
    }
  }
}

// Export singleton instance
export const stravaCronService = new StravaCronService();
