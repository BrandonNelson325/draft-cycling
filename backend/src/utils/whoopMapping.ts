/**
 * Pure WHOOP → Draft mapping (no I/O, unit-tested in verifyWhoop).
 *
 * Day mapping: a recovery belongs to the LOCAL day the athlete woke up — the
 * end of the (non-nap) sleep it's linked to, in WHOOP's own timezone_offset.
 * Day strain comes from the cycle linked to that sleep. Only SCORED records
 * are used (PENDING_SCORE / UNSCORABLE = no data yet).
 */
import crypto from 'crypto';

export interface WhoopRecovery {
  cycle_id: number; sleep_id: string; created_at: string; score_state: string;
  score?: { user_calibrating?: boolean; recovery_score?: number; resting_heart_rate?: number; hrv_rmssd_milli?: number; spo2_percentage?: number; skin_temp_celsius?: number };
}
export interface WhoopSleep {
  id: string; cycle_id?: number; start: string; end: string; timezone_offset: string; nap: boolean; score_state: string;
  score?: {
    stage_summary?: { total_in_bed_time_milli?: number; total_awake_time_milli?: number };
    sleep_needed?: { baseline_milli?: number; need_from_sleep_debt_milli?: number; need_from_recent_strain_milli?: number; need_from_recent_nap_milli?: number };
    respiratory_rate?: number; sleep_performance_percentage?: number; sleep_consistency_percentage?: number; sleep_efficiency_percentage?: number;
  };
}
export interface WhoopCycle { id: number; start: string; end?: string | null; timezone_offset: string; score_state: string; score?: { strain?: number } }
export interface WhoopWorkout {
  id: string; start: string; end: string; timezone_offset: string; sport_name?: string; score_state: string;
  score?: { strain?: number; average_heart_rate?: number; max_heart_rate?: number };
}

export interface DailyWhoop {
  date: string;
  hasWellness: boolean; // recovery or sleep present → Whoop owns the day's wellness
  fields: Record<string, any>;
}

/** Local YYYY-MM-DD (and hour) of an instant, using WHOOP's "+HH:MM" offset. */
export function localDateTime(iso: string, offset: string): { date: string; hour: number } {
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset || '+00:00');
  const mins = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const local = new Date(new Date(iso).getTime() + mins * 60_000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours() };
}

/** Rides come from Strava (with power) — Whoop's copy would double-count. */
export function isCyclingSport(sport?: string): boolean {
  return /cycl|bik|spin|zwift|peloton|velo|bmx|gravel/i.test(sport || '');
}

const scored = <T extends { score_state: string }>(xs: T[]) => xs.filter((x) => x.score_state === 'SCORED');
const round = (n?: number | null) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null);
const dec = (n?: number | null) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

export function buildDailyWhoop(input: {
  recoveries: WhoopRecovery[]; sleeps: WhoopSleep[]; cycles: WhoopCycle[]; workouts: WhoopWorkout[];
}): DailyWhoop[] {
  const days = new Map<string, DailyWhoop>();
  const day = (date: string) => {
    if (!days.has(date)) days.set(date, { date, hasWellness: false, fields: {} });
    return days.get(date)!;
  };

  const mainSleeps = scored(input.sleeps).filter((s) => !s.nap);
  const sleepById = new Map(mainSleeps.map((s) => [s.id, s]));
  const dateByCycle = new Map<number, string>();

  // Sleep → the day you woke up.
  for (const s of mainSleeps) {
    const { date } = localDateTime(s.end, s.timezone_offset);
    if (s.cycle_id != null) dateByCycle.set(s.cycle_id, date);
    const sc = s.score || {};
    const inBed = sc.stage_summary?.total_in_bed_time_milli;
    const awake = sc.stage_summary?.total_awake_time_milli ?? 0;
    const need = sc.sleep_needed;
    const d = day(date);
    d.hasWellness = true;
    Object.assign(d.fields, {
      sleep_seconds: inBed != null ? Math.round((inBed - awake) / 1000) : null,
      wellness_sleep_score: round(sc.sleep_performance_percentage),
      sleep_efficiency: round(sc.sleep_efficiency_percentage),
      sleep_consistency: round(sc.sleep_consistency_percentage),
      respiratory_rate: dec(sc.respiratory_rate),
      sleep_need_seconds: need
        ? Math.round(((need.baseline_milli ?? 0) + (need.need_from_sleep_debt_milli ?? 0) + (need.need_from_recent_strain_milli ?? 0) + (need.need_from_recent_nap_milli ?? 0)) / 1000)
        : null,
      sleep_debt_seconds: need?.need_from_sleep_debt_milli != null ? Math.round(need.need_from_sleep_debt_milli / 1000) : null,
    });
  }

  // Recovery → same day as its sleep.
  for (const r of scored(input.recoveries)) {
    const s = sleepById.get(r.sleep_id);
    const date = s ? localDateTime(s.end, s.timezone_offset).date : dateByCycle.get(r.cycle_id);
    if (!date) continue; // can't place it reliably — skip rather than guess
    dateByCycle.set(r.cycle_id, date);
    const sc = r.score || {};
    const d = day(date);
    d.hasWellness = true;
    Object.assign(d.fields, {
      readiness_score: round(sc.recovery_score),
      hrv: round(sc.hrv_rmssd_milli),
      rhr: round(sc.resting_heart_rate),
      spo2: dec(sc.spo2_percentage),
      skin_temp_c: dec(sc.skin_temp_celsius),
      recovery_calibrating: sc.user_calibrating ?? null,
    });
  }

  // Cycle strain → the day its sleep ended; otherwise its local start day
  // (a cycle starting in the evening belongs to the next day).
  for (const c of scored(input.cycles)) {
    let date = dateByCycle.get(c.id);
    if (!date) {
      const { date: d0, hour } = localDateTime(c.start, c.timezone_offset);
      date = hour >= 18 ? new Date(new Date(d0 + 'T12:00:00Z').getTime() + 86_400_000).toISOString().slice(0, 10) : d0;
    }
    day(date).fields.day_strain = dec(c.score?.strain);
  }

  // Non-cycling workouts → context for the coach on the day they happened.
  const other = new Map<string, any[]>();
  for (const w of scored(input.workouts)) {
    if (isCyclingSport(w.sport_name)) continue;
    const { date } = localDateTime(w.start, w.timezone_offset);
    const list = other.get(date) || [];
    list.push({
      sport: w.sport_name || 'activity',
      start: w.start,
      minutes: Math.round((new Date(w.end).getTime() - new Date(w.start).getTime()) / 60000),
      strain: dec(w.score?.strain),
      avg_hr: round(w.score?.average_heart_rate),
      max_hr: round(w.score?.max_heart_rate),
    });
    other.set(date, list);
  }
  for (const [date, list] of other) day(date).fields.other_activities = list;

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * WHOOP webhook signature: base64( HMAC-SHA256( timestamp + rawBody, clientSecret ) ),
 * compared against X-WHOOP-Signature. Timing-safe.
 */
export function verifyWhoopSignature(rawBody: Buffer | string, timestamp: string | undefined, signature: string | undefined, secret: string): boolean {
  if (!timestamp || !signature || !secret) return false;
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto.createHmac('sha256', secret).update(timestamp + body).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
