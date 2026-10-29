/**
 * Planned-vs-actual block for "Give me a debrief on my ride …" chat requests.
 *
 * Oct 29 2026: a 70-min Z2 ride that turned into a Zwift group ride (5-min best
 * at 97% FTP, 1-min at 129%, 71 TSS vs 53 planned) got "Today's endurance ride
 * is done (71 TSS)" plus a plan summary. The debrief request never handed the
 * coach the ride or what was prescribed, so in simple mode it answered from
 * the summary line. A debrief's real question is "was that the right dose for
 * what was planned, and what now?" — so the facts are attached to the message.
 *
 * The comparison is pure (testable); loading it is in loadRideDebriefBlock.
 */
import { supabaseAdmin } from './supabase';

const DEBRIEF_RE = /^Give me a (?:full )?debrief on my (?:ride|interval workout) "(.+?)"/;

/** The ride name from the post-ride popup's debrief message, else null. */
export function parseDebriefRequest(message: string): string | null {
  return DEBRIEF_RE.exec(message.trim())?.[1] ?? null;
}

export interface PlannedSession {
  name: string;
  workout_type?: string | null;
  duration_minutes?: number | null;
  tss?: number | null;
  /** Main-set target as % FTP (the longest work block), if known. */
  targetPct?: number | null;
}

export interface RideFacts {
  name: string;
  duration_min: number;
  avg_watts?: number | null;
  np?: number | null;
  tss?: number | null;
  rpe?: number | null; // 1–5
  notes?: string | null;
  bests?: { s5?: number | null; s30?: number | null; m1?: number | null; m5?: number | null; m20?: number | null };
}

/** Upper %FTP of each easy type — anything well above it isn't that session any more. */
const EASY_CEILING: Record<string, number> = { recovery: 55, endurance: 75 };

export type Dose = 'more' | 'less' | 'about right';

export interface Comparison {
  dose: Dose;
  reasons: string[];
}

const pct = (w: number | null | undefined, ftp: number) => (w && ftp ? Math.round((w / ftp) * 100) : null);

/** Did the ride deliver the prescribed stimulus, more, or less? */
export function comparePlannedVsActual(planned: PlannedSession, ride: RideFacts, ftp: number): Comparison {
  const more: string[] = [];
  const less: string[] = [];
  const type = String(planned.workout_type || '');
  const ceiling = EASY_CEILING[type];

  if (planned.tss && ride.tss) {
    const ratio = ride.tss / planned.tss;
    const diff = Math.round((ratio - 1) * 100);
    if (ratio >= 1.2) more.push(`TSS ${Math.round(ride.tss)} vs ${Math.round(planned.tss)} planned (+${diff}%)`);
    else if (ratio <= 0.8) less.push(`TSS ${Math.round(ride.tss)} vs ${Math.round(planned.tss)} planned (${diff}%)`);
  }
  if (planned.duration_minutes && ride.duration_min) {
    const ratio = ride.duration_min / planned.duration_minutes;
    if (ratio <= 0.75) less.push(`${ride.duration_min} min vs ${planned.duration_minutes} planned`);
    else if (ratio >= 1.3) more.push(`${ride.duration_min} min vs ${planned.duration_minutes} planned`);
  }

  if (ceiling) {
    const b = ride.bests || {};
    const npPct = pct(ride.np, ftp);
    if (npPct && npPct > ceiling + 3) more.push(`NP ${ride.np} W = ${npPct}% FTP, above the ${ceiling}% ceiling for ${type}`);
    // Short hard efforts don't move the average much but they are the training
    // stress an easy day is meant to avoid.
    const efforts = [
      [b.m20, 20, 88, '20-min'],
      [b.m5, 5, 90, '5-min'],
      [b.m1, 1, 115, '1-min'],
      [b.s30, 0.5, 140, '30-sec'],
    ] as const;
    const hard = efforts
      .filter(([w, , floor]) => (pct(w, ftp) ?? 0) >= floor)
      .map(([w, , , label]) => `${label} ${w} W (${pct(w, ftp)}% FTP)`);
    if (hard.length) more.push(`hard efforts on an easy day: ${hard.join(', ')}`);
  } else if (planned.targetPct && ride.np) {
    // A quality session ridden well below its target didn't deliver it.
    const npPct = pct(ride.np, ftp)!;
    if (npPct < planned.targetPct * 0.75) less.push(`NP ${npPct}% FTP vs a ${planned.targetPct}% main set`);
  }
  if (ride.rpe && ceiling && ride.rpe >= 4) more.push(`RPE ${ride.rpe}/5 on a ${type} day`);

  // An easy day with hard efforts is "more" even if it came in short.
  if (more.length) return { dose: 'more', reasons: [...more, ...less] };
  if (less.length) return { dose: 'less', reasons: less };
  return { dose: 'about right', reasons: [] };
}

function fmtPlanned(p: PlannedSession): string {
  const bits = [p.workout_type, p.duration_minutes && `${p.duration_minutes} min`, p.targetPct && `main set ${p.targetPct}% FTP`, p.tss && `${Math.round(p.tss)} TSS`];
  return `"${p.name.replace(/^Draft - /, '')}" (${bits.filter(Boolean).join(', ')})`;
}

export function formatRideDebrief(
  ride: RideFacts,
  ftp: number,
  planned: PlannedSession | null,
  upcoming: { date: string; label: string }[]
): string {
  const b = ride.bests || {};
  const best = [
    b.s5 && `5s ${b.s5}`, b.s30 && `30s ${b.s30}`, b.m1 && `1min ${b.m1}`,
    b.m5 && `5min ${b.m5} (${pct(b.m5, ftp)}%)`, b.m20 && `20min ${b.m20} (${pct(b.m20, ftp)}%)`,
  ].filter(Boolean).join(', ');
  const ifStr = ride.np && ftp ? ` (IF ${(ride.np / ftp).toFixed(2)})` : '';
  const lines = [
    `[RIDE TO DEBRIEF — from the database]`,
    `Ride: "${ride.name}", ${ride.duration_min} min, avg ${ride.avg_watts ?? '?'} W, NP ${ride.np ?? '?'} W${ifStr}, ${ride.tss != null ? Math.round(ride.tss) : '?'} TSS. FTP ${ftp} W.`,
    best && `Best efforts (W): ${best}.`,
    `Athlete: RPE ${ride.rpe ?? 'not given'}/5${ride.notes ? `, notes: "${ride.notes}"` : ', no notes'}.`,
  ];
  if (planned) {
    const c = comparePlannedVsActual(planned, ride, ftp);
    lines.push(`Planned for that day: ${fmtPlanned(planned)}.`);
    lines.push(`Dose vs plan: ${c.dose.toUpperCase()}${c.reasons.length ? ` — ${c.reasons.join('; ')}` : ''}.`);
  } else {
    lines.push('Planned for that day: nothing — judge it against where they are in the plan.');
  }
  if (upcoming.length) lines.push(`Next up: ${upcoming.map((u) => `${u.date} ${u.label}`).join('; ')}.`);
  lines.push(
    'Debrief it: (1) was this the right dose for what was planned — too much, too little or on target, naming the specific efforts; ' +
      '(2) what that means for the next 1–2 days — keep, ease or move the next session, and offer to make the calendar change. ' +
      "The athlete's RPE/notes outrank the numbers if they disagree."
  );
  return lines.filter(Boolean).join('\n');
}

/** Longest work block's power — the session's main-set target. */
export function mainSetPct(intervals: any[] | null | undefined): number | null {
  let best: { d: number; p: number } | null = null;
  for (const i of intervals || []) {
    if (i?.type !== 'work') continue;
    const p = i.power ?? i.power_high;
    const d = (i.duration || 0) * (i.repeat || 1);
    if (p && (!best || d > best.d)) best = { d, p };
  }
  return best?.p ?? null;
}

/**
 * Build the block for a debrief message, or null when it isn't one / the ride
 * can't be found. Matches the most recent ride with that name in the last 3 days.
 */
export async function loadRideDebriefBlock(athleteId: string, message: string, ftp: number | null | undefined): Promise<string | null> {
  const name = parseDebriefRequest(message);
  if (!name || !ftp) return null;
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data: ride } = await supabaseAdmin
    .from('strava_activities')
    .select('strava_activity_id, name, start_date, moving_time_seconds, average_watts, tss, perceived_effort, post_activity_notes, raw_data')
    .eq('athlete_id', athleteId)
    .eq('name', name)
    .gte('start_date', since)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ride) return null;

  const [{ data: curve }, { data: entry }] = await Promise.all([
    supabaseAdmin.from('power_curves').select('*').eq('athlete_id', athleteId).eq('strava_activity_id', ride.strava_activity_id).maybeSingle(),
    supabaseAdmin
      .from('calendar_entries')
      .select('scheduled_date, workouts(name, workout_type, duration_minutes, tss, intervals)')
      .eq('athlete_id', athleteId)
      .eq('strava_activity_id', ride.strava_activity_id)
      .limit(1)
      .maybeSingle(),
  ]);
  const raw: any = ride.raw_data || {};
  const facts: RideFacts = {
    name: ride.name,
    duration_min: Math.round((ride.moving_time_seconds || 0) / 60),
    avg_watts: ride.average_watts,
    np: raw.weighted_average_watts || null,
    tss: ride.tss,
    rpe: ride.perceived_effort,
    notes: ride.post_activity_notes,
    bests: curve
      ? { s5: curve.power_5sec, s30: curve.power_30sec, m1: curve.power_1min, m5: curve.power_5min, m20: curve.power_20min }
      : undefined,
  };
  const w: any = (entry as any)?.workouts;
  const planned: PlannedSession | null = w
    ? { name: w.name, workout_type: w.workout_type, duration_minutes: w.duration_minutes, tss: w.tss, targetPct: mainSetPct(w.intervals) }
    : null;

  const rideDate = (entry as any)?.scheduled_date || String(ride.start_date).slice(0, 10);
  const { data: next } = await supabaseAdmin
    .from('calendar_entries')
    .select('scheduled_date, entry_type, completed, workouts(name)')
    .eq('athlete_id', athleteId)
    .gt('scheduled_date', rideDate)
    .order('scheduled_date', { ascending: true })
    .limit(3);
  const upcoming = (next || [])
    .filter((e: any) => !e.completed)
    .slice(0, 2)
    .map((e: any) => ({ date: e.scheduled_date, label: e.entry_type === 'rest' ? 'rest' : String(e.workouts?.name || 'workout').replace(/^Draft - /, '') }));

  return formatRideDebrief(facts, ftp, planned, upcoming);
}
