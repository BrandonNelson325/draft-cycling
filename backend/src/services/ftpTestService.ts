/**
 * FTP tests: reads the result of a scheduled 20-min FTP test once the ride
 * syncs, and sets FTP = 95% of the best 20-min power.
 *
 * Why this exists: FTP auto-estimation only sees maximal efforts, and a rider
 * following a plan at % of FTP rarely makes any — so FTP stalls, the targets
 * never move, and the athlete stops progressing. A real test at the start of
 * each block resets the zones. Unlike auto-estimation (raise-only), a test is
 * the truth and may lower FTP a little; a big drop is held for the coach to
 * discuss (sick, bad pacing, skipped the test).
 *
 * Deliberately does NOT import ftpEstimationService (which calls this) — no
 * circular import.
 */
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { todayInTimezone, utcToLocalDate } from '../utils/timezone';
import { isFtpTestWorkout } from '../utils/ftpTest';

export const FTP_TEST_NOTE_PREFIX = 'FTP test';

export interface FtpTestDecision {
  testFtp: number;
  commit: boolean;
  reason: 'ftp_test_initial' | 'ftp_test_raised' | 'ftp_test_lowered' | 'ftp_test_suspect_low' | 'ftp_test_not_completed';
}

/** Pure: what to do with a test's best 20-min power. */
export function decideFtpFromTest(currentFtp: number | null | undefined, best20: number): FtpTestDecision {
  const testFtp = Math.round(best20 * 0.95);
  if (!currentFtp) return { testFtp, commit: true, reason: 'ftp_test_initial' };
  // A real 20-min test lands ~100–110% of FTP. Under 85% the rider plainly
  // didn't do the test effort (rode easy, cut it short) — ignore it.
  if (best20 < currentFtp * 0.85) return { testFtp, commit: false, reason: 'ftp_test_not_completed' };
  if (testFtp >= currentFtp) return { testFtp, commit: true, reason: 'ftp_test_raised' };
  if (testFtp >= currentFtp * 0.95) return { testFtp, commit: true, reason: 'ftp_test_lowered' };
  return { testFtp, commit: false, reason: 'ftp_test_suspect_low' };
}

function noteFor(d: FtpTestDecision, best20: number, currentFtp: number | null): string {
  const base = `${FTP_TEST_NOTE_PREFIX}: best 20 min ${best20}W`;
  switch (d.reason) {
    case 'ftp_test_initial':
    case 'ftp_test_raised':
      return `${base} → FTP ${d.testFtp}W${currentFtp ? ` (was ${currentFtp}W)` : ''}`;
    case 'ftp_test_lowered':
      return `${base} → FTP ${d.testFtp}W (was ${currentFtp}W — zones adjusted down slightly)`;
    case 'ftp_test_suspect_low':
      return `${base} → ${d.testFtp}W is well below current ${currentFtp}W — FTP held; worth a chat with your coach`;
    case 'ftp_test_not_completed':
      return `${base} — not a full test effort, FTP unchanged`;
  }
}

export const ftpTestService = {
  /**
   * Process any scheduled FTP test from the last week that now has a synced
   * ride with power. Idempotent: a processed entry is marked via its notes.
   * Returns the most recent result, or null if there was nothing to process.
   */
  async applyPendingFtpTests(athleteId: string): Promise<{ committed: boolean; ftp: number | null; reason: string } | null> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp, timezone')
      .eq('id', athleteId)
      .single();
    const tz = athlete?.timezone || 'America/Los_Angeles';
    const today = todayInTimezone(tz);
    const from = new Date(today + 'T12:00:00Z');
    from.setUTCDate(from.getUTCDate() - 7);
    const fromIso = from.toISOString().split('T')[0];

    const { data: entries } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, scheduled_date, notes, workouts(intervals)')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', fromIso)
      .lte('scheduled_date', today)
      .order('scheduled_date', { ascending: true });

    const pending = (entries || []).filter((e: any) =>
      e.workouts && isFtpTestWorkout(e.workouts) && !(e.notes || '').startsWith(FTP_TEST_NOTE_PREFIX)
    );
    if (pending.length === 0) return null;

    // Rides with a computed power curve in the window, grouped by local day.
    const { data: activities } = await supabaseAdmin
      .from('strava_activities')
      .select('strava_activity_id, start_date')
      .eq('athlete_id', athleteId)
      .gte('start_date', from.toISOString());
    if (!activities?.length) return null;
    const { data: curves } = await supabaseAdmin
      .from('power_curves')
      .select('strava_activity_id, power_20min')
      .eq('athlete_id', athleteId)
      .in('strava_activity_id', activities.map((a: any) => a.strava_activity_id));
    const p20 = new Map((curves || []).map((c: any) => [String(c.strava_activity_id), Number(c.power_20min) || 0]));

    let currentFtp: number | null = athlete?.ftp ?? null;
    let result: { committed: boolean; ftp: number | null; reason: string } | null = null;

    for (const entry of pending as any[]) {
      const sameDay = activities
        .filter((a: any) => utcToLocalDate(a.start_date, tz) === entry.scheduled_date)
        .map((a: any) => ({ id: a.strava_activity_id, p: p20.get(String(a.strava_activity_id)) || 0 }))
        .sort((a, b) => b.p - a.p);
      const best = sameDay[0];
      if (!best || best.p <= 0) continue; // not ridden yet / curve not computed yet

      const decision = decideFtpFromTest(currentFtp, best.p);
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        ftp_estimate: decision.testFtp,
        ftp_estimate_conf: 'high',
        ftp_estimate_reason: decision.reason,
        ftp_estimated_at: now,
      };
      if (decision.commit) { update.ftp = decision.testFtp; update.updated_at = now; }
      let { error } = await supabaseAdmin.from('athletes').update(update).eq('id', athleteId);
      if (error?.code === 'PGRST204' && decision.commit) {
        // Observability columns not migrated (038) — still commit the FTP.
        ({ error } = await supabaseAdmin.from('athletes').update({ ftp: decision.testFtp, updated_at: now }).eq('id', athleteId));
      }
      if (error) { logger.error(`[FTP test] Failed to record result for ${athleteId}:`, error); continue; }

      await supabaseAdmin
        .from('calendar_entries')
        .update({
          completed: decision.reason !== 'ftp_test_not_completed',
          completed_at: now,
          strava_activity_id: best.id,
          notes: noteFor(decision, best.p, currentFtp),
        })
        .eq('id', entry.id)
        .eq('athlete_id', athleteId);

      logger.info(`[FTP test] ${athleteId}: 20-min ${best.p}W → ${decision.testFtp}W (${decision.reason})`);
      if (decision.commit) currentFtp = decision.testFtp;
      result = { committed: decision.commit, ftp: currentFtp, reason: decision.reason };
    }
    return result;
  },
};
