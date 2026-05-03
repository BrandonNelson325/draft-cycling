import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { intervalsIcuService } from './intervalsIcuService';
import { logger } from '../utils/logger';
import { todayInTimezone } from '../utils/timezone';

/**
 * Wellness sync cron — pulls sleep/HRV/RHR/readiness from intervals.icu for any
 * athlete who has opted in via Settings → "Use sleep & recovery data from
 * intervals.icu". Runs every 15 minutes; the pull itself is idempotent (upsert
 * on athlete_id+date), and we skip athletes who already have today's wellness.
 *
 * Wearable devices typically sync overnight metrics to intervals.icu sometime
 * between 4am and 9am local depending on the user. The 15-minute cadence
 * means most athletes get their data within 15 min of it being available.
 */
export function startWellnessSyncCron() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const { data: athletes, error } = await supabaseAdmin
        .from('athletes')
        .select('id, timezone')
        .eq('intervals_icu_use_wellness', true)
        .not('intervals_icu_access_token', 'is', null);

      if (error) {
        logger.error('[WellnessCron] Error querying opted-in athletes:', error);
        return;
      }

      if (!athletes || athletes.length === 0) return;

      let attempted = 0;
      let synced = 0;

      for (const athlete of athletes) {
        const tz = (athlete.timezone as string) || 'UTC';
        const todayDate = todayInTimezone(tz);

        // Skip if we already have today's wellness for this athlete.
        const { data: existing } = await supabaseAdmin
          .from('daily_metrics')
          .select('wellness_synced_at')
          .eq('athlete_id', athlete.id)
          .eq('date', todayDate)
          .maybeSingle();

        if (existing?.wellness_synced_at) continue;

        attempted++;
        try {
          const ok = await intervalsIcuService.pullWellnessForDate(athlete.id, todayDate);
          if (ok) synced++;
        } catch (err) {
          logger.warn(`[WellnessCron] Pull failed for athlete ${athlete.id}:`, err);
        }
      }

      if (attempted > 0) {
        logger.debug(`[WellnessCron] Attempted ${attempted}, synced ${synced}`);
      }
    } catch (err) {
      logger.error('[WellnessCron] Fatal error:', err);
    }
  });

  logger.info('[WellnessCron] Wellness sync cron started (runs every 15 min)');
}
