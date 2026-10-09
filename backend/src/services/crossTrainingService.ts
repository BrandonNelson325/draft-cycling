/**
 * Cross-training (non-cycling Strava activities): storage + daily load feed.
 * Rating logic lives in utils/activityLoad.ts (pure). Kept out of
 * strava_activities on purpose — see migration 041.
 */
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { buildDailyLoad, estimateActivityLoad, categorize, CATEGORY_PROFILES } from '../utils/activityLoad';

const ageFrom = (dob?: string | null) =>
  dob ? Math.floor((Date.now() - new Date(dob + 'T12:00:00Z').getTime()) / (365.25 * 86400000)) : null;

export const crossTrainingService = {
  /** Athlete HR physiology for the HR-based load estimate. */
  async physiology(athleteId: string): Promise<{ maxHr: number | null; restingHr: number | null; age: number | null }> {
    const { data } = await supabaseAdmin
      .from('athletes').select('max_hr, resting_hr, date_of_birth').eq('id', athleteId).single();
    return { maxHr: data?.max_hr ?? null, restingHr: data?.resting_hr ?? null, age: ageFrom(data?.date_of_birth) };
  },

  /** Rate + upsert a non-cycling Strava activity. Returns false if the table isn't migrated yet. */
  async store(athleteId: string, a: any, phys?: { maxHr: number | null; restingHr: number | null; age: number | null }): Promise<boolean> {
    const p = phys || (await this.physiology(athleteId));
    const load = estimateActivityLoad({
      sportType: a.sport_type, type: a.type, movingTimeSeconds: a.moving_time,
      averageHeartrate: a.average_heartrate, maxHr: p.maxHr, restingHr: p.restingHr, age: p.age,
    });
    const { error } = await supabaseAdmin.from('cross_training_activities').upsert({
      athlete_id: athleteId,
      strava_activity_id: a.id,
      name: a.name,
      sport_type: a.sport_type || a.type || 'Workout',
      category: load.category,
      start_date: a.start_date,
      moving_time_seconds: a.moving_time ?? null,
      distance_meters: a.distance != null ? Math.round(a.distance) : null,
      total_elevation_gain: a.total_elevation_gain ?? null,
      average_heartrate: a.average_heartrate ?? null,
      max_heartrate: a.max_heartrate ?? null,
      est_tss: load.estTss,
      fitness_load: load.fitnessLoad,
      fatigue_load: load.fatigueLoad,
      load_method: load.method,
      raw_data: a,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'strava_activity_id' });
    if (error) {
      logger.warn(`[CrossTraining] store ${a.id} failed: ${error.message}`);
      return false;
    }
    return true;
  },

  async remove(stravaActivityId: number): Promise<void> {
    await supabaseAdmin.from('cross_training_activities').delete().eq('strava_activity_id', stravaActivityId);
  },

  /** Non-cycling activities in a window (empty if the table isn't migrated yet). */
  async list(athleteId: string, sinceIso: string, untilIso?: string): Promise<any[]> {
    let q = supabaseAdmin.from('cross_training_activities')
      .select('strava_activity_id, name, sport_type, category, start_date, moving_time_seconds, distance_meters, average_heartrate, est_tss, fitness_load, fatigue_load, load_method')
      .eq('athlete_id', athleteId).gte('start_date', sinceIso).order('start_date', { ascending: false });
    if (untilIso) q = q.lte('start_date', untilIso);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  },

  /**
   * Daily fitness/fatigue inputs for the CTL/ATL EMAs: rides (TSS, 1:1) +
   * cross-training (fitness_load → CTL, fatigue_load → ATL).
   */
  async dailyLoad(athleteId: string, sinceIso: string, untilIso: string) {
    const [{ data: rides }, other] = await Promise.all([
      supabaseAdmin.from('strava_activities').select('start_date, tss')
        .eq('athlete_id', athleteId).gte('start_date', sinceIso).lte('start_date', untilIso).not('tss', 'is', null),
      this.list(athleteId, sinceIso, untilIso),
    ]);
    return buildDailyLoad(rides || [], other);
  },

  /** Short label + coaching note for an activity category. */
  describe(category: string) {
    const c = CATEGORY_PROFILES[(category as keyof typeof CATEGORY_PROFILES)] || CATEGORY_PROFILES.other;
    return { label: c.label, note: c.note };
  },
  categorize,
};
