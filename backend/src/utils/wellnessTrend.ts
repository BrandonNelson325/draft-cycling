/**
 * HRV trend analysis for athletes WITHOUT Whoop — Apple Health (Garmin, Apple
 * Watch, Oura…) or intervals.icu wellness. There's no recovery % here and we
 * never invent one; instead HRV is read against the athlete's own baseline,
 * the same way the Whoop analysis reads recovery. Pure + exported for tests.
 */

export interface HrvDay {
  date: string;
  wellness_source?: string | null;
  hrv?: number | null;
  rhr?: number | null;
  sleep_seconds?: number | null;
}

export type HrvStatus = 'normal' | 'slightly_low' | 'low' | 'high';

export interface HrvTrend {
  hasToday: boolean;
  status: HrvStatus | null;
  /** % vs the prior-7-day average (negative = below baseline). */
  hrvPct: number | null;
  /** Consecutive days (incl. today) at least 15% below baseline. */
  lowStreak: number;
  /** A big HRV drop nothing else supports (likely a bad reading). Ask, don't assume. */
  suspect: boolean;
  /** One line for the LIVE STATE snapshot ('' when there's not enough data). */
  line: string;
}

const SOURCES = new Set(['apple_health', 'intervals_icu']);
const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`;
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export const statusFor = (pct: number): HrvStatus =>
  pct <= -20 ? 'low' : pct <= -10 ? 'slightly_low' : pct >= 15 ? 'high' : 'normal';

/** Needs today's HRV plus ≥3 earlier HRV days from the same kind of source. */
export function summarizeHrvTrend(todayIso: string, history: HrvDay[]): HrvTrend {
  const empty: HrvTrend = { hasToday: false, status: null, hrvPct: null, lowStreak: 0, suspect: false, line: '' };
  const days = history
    .filter((d) => SOURCES.has(d.wellness_source || '') && d.hrv != null)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first
  const today = days.find((d) => d.date === todayIso);
  if (!today) return empty;

  const baselineFor = (date: string) => {
    const prior = days.filter((d) => d.date < date).slice(0, 7);
    return prior.length >= 3 ? avg(prior.map((d) => d.hrv as number)) : null;
  };
  const base = baselineFor(todayIso);
  if (base == null) return empty;

  const pct = Math.round((((today.hrv as number) - base) / base) * 100);
  const status = statusFor(pct);

  let lowStreak = 0;
  for (const d of days) {
    const b = baselineFor(d.date);
    if (b == null || ((d.hrv as number) - b) / b > -0.15) break;
    lowStreak++;
  }

  const prior = days.filter((d) => d.date < todayIso).slice(0, 7);
  const rhrPrior = prior.filter((d) => d.rhr != null).map((d) => d.rhr as number);
  const rhrBase = rhrPrior.length >= 3 ? avg(rhrPrior) : null;
  const rhrDelta = today.rhr != null && rhrBase != null ? Math.round(today.rhr - rhrBase) : null;
  const sleepPrior = prior.filter((d) => d.sleep_seconds != null).map((d) => d.sleep_seconds as number);
  const sleepBase = sleepPrior.length >= 3 ? avg(sleepPrior) : null;

  // Big drop that nothing else supports → probably the watch, not the athlete.
  const yIso = new Date(new Date(todayIso + 'T12:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10);
  const y = days.find((d) => d.date === yIso);
  const yBase = y ? baselineFor(yIso) : null;
  const yesterdayNormal = !!y && yBase != null && ((y.hrv as number) - yBase) / yBase > -0.1;
  const rhrNormal = rhrDelta != null && rhrDelta <= 3;
  const sleptNormally = today.sleep_seconds != null && sleepBase != null && today.sleep_seconds >= 0.85 * sleepBase;
  const suspect = status === 'low' && yesterdayNormal && rhrNormal && sleptNormally;

  const src = today.wellness_source === 'apple_health' ? 'Apple Health' : 'intervals.icu';
  const label = { normal: 'normal', slightly_low: 'SLIGHTLY LOW', low: 'LOW', high: 'above baseline' }[status];
  const parts = [`HRV ${today.hrv}ms (${pct >= 0 ? '+' : ''}${pct}% vs 7-day avg ${Math.round(base)} — ${label})`];
  if (lowStreak >= 2) parts.push(`${lowStreak} days in a row ≥15% below baseline`);
  if (today.rhr != null) parts.push(`resting HR ${today.rhr}${rhrDelta != null ? ` (${rhrDelta >= 0 ? '+' : ''}${rhrDelta} vs avg)` : ''}`);
  if (today.sleep_seconds != null) parts.push(`sleep ${hm(today.sleep_seconds)}${sleepBase ? ` (usual ${hm(sleepBase)})` : ''}`);
  const suspectTxt = suspect
    ? ' ⚠ This low HRV is not supported by the other signals (normal yesterday, normal resting HR and sleep) — possibly a bad reading (watch fit, missed night). CHECK with the athlete before recommending any change.'
    : '';
  return { hasToday: true, status, hrvPct: pct, lowStreak, suspect, line: `- Wellness (${src}): ${parts.join('; ')}.${suspectTxt}` };
}

/** System-prompt rules — only for athletes with HRV from Apple Health / intervals.icu (not Whoop). */
export const HRV_TREND_RULES = `**HRV TREND (from the athlete's watch via Apple Health / intervals.icu):**
There is no recovery score here — never invent one. Read HRV against the athlete's own 7-day baseline, together with resting HR, sleep, training load (TSB) and how important today's session is.
- NEVER change the plan automatically. ALWAYS SUGGEST with the reason, and ASK before changing anything — watches misread, and a rider who feels good can still do the work.
- Normal or above baseline: go as planned.
- SLIGHTLY LOW (−10 to −20%): usually fine; on a hard day consider trimming a rep or holding the low end.
- LOW (−20% or worse): make a strong recommendation to back off a hard session (Z2 or rest on a non-key day); ask before changing. Elevated resting HR (+5 or more) or short sleep makes it more convincing. 2+ low days in a row → strongly recommend backing off.
- LOW THAT DOESN'T ADD UP (flagged ⚠ in LIVE STATE): likely a bad reading — ask one quick check ("your HRV reads low but resting HR and sleep look normal — how do the legs feel?") before recommending a change.
- Trend beats one day; say which it is.`;
