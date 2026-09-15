/**
 * Interval analysis — turn a ride's raw Strava laps into a structured
 * work/recovery rep breakdown the AI coach can debrief.
 *
 * Everything here is PURE (laps + ftp in → analysis out) so it's unit-testable
 * with no DB/network. See `npm run test:intervals`.
 *
 * Detection is LAP-based: a structured workout on a head unit almost always
 * records one lap per step (warm-up, each work rep, each recovery, cool-down),
 * so the laps already encode the intervals. Stream-based auto-detection (for
 * rides where the rider never pressed lap) is a deliberate future enhancement.
 */

/** Lean lap shape we store on strava_activities.laps */
export interface Lap {
  index: number;       // 1-based lap number
  duration_s: number;  // moving time (fallback elapsed)
  distance_m: number;
  avg_watts: number | null;
  max_watts: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_cadence: number | null;
}

export interface IntervalRep {
  rep: number;         // 1-based rep number (not lap index)
  lap_index: number;
  duration_s: number;
  avg_watts: number | null;
  pct_ftp: number | null;   // % of FTP, rounded
  avg_hr: number | null;
  avg_cadence: number | null;
}

export interface IntervalAnalysis {
  hasIntervals: boolean;
  reason?: string;              // set when hasIntervals is false
  ftp?: number;
  structure_label?: string;     // e.g. "6 × 3:00"
  rep_count?: number;
  reps?: IntervalRep[];
  summary?: {
    avg_power: number | null;
    avg_pct_ftp: number | null;
    avg_hr: number | null;
    avg_cadence: number | null;
    avg_duration_s: number;
    fade_pct: number | null;        // >0 = faded (power dropped); <0 = negative split
    strongest_rep: number;          // rep number
    weakest_rep: number;
    consistency_cv_pct: number | null; // coefficient of variation of rep power, %
    hr_drift_bpm: number | null;    // last rep avg HR − first rep avg HR
    avg_recovery_power: number | null;
  };
}

/** Trim raw Strava lap objects down to what we store + analyze. */
export function trimLaps(rawLaps: any[]): Lap[] {
  if (!Array.isArray(rawLaps)) return [];
  return rawLaps.map((l, i) => ({
    index: l.lap_index ?? i + 1,
    duration_s: Math.round(l.moving_time ?? l.elapsed_time ?? 0),
    distance_m: Math.round(l.distance ?? 0),
    avg_watts: numOrNull(l.average_watts),
    max_watts: numOrNull(l.max_watts),
    avg_hr: numOrNull(l.average_heartrate),
    max_hr: numOrNull(l.max_heartrate),
    avg_cadence: numOrNull(l.average_cadence),
  }));
}

function numOrNull(v: any): number | null {
  return typeof v === 'number' && !Number.isNaN(v) ? Math.round(v * 10) / 10 : null;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function fmtMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Classify laps into work vs recovery and compute the rep breakdown.
 * A lap counts as "work" when it's both meaningfully harder than the ride's
 * easy baseline AND, when FTP is known, at/above ~0.83 IF — so warm-ups,
 * recoveries and cool-downs don't get miscounted as reps.
 */
export function analyzeIntervals(laps: Lap[], ftp: number): IntervalAnalysis {
  // A structured session has warm-up + reps + recoveries + cool-down → many
  // laps. One or two laps is just a ride, not an interval workout.
  if (!laps || laps.length < 3) {
    return { hasIntervals: false, reason: 'No distinct intervals recorded (ride has too few laps).' };
  }

  const powered = laps.filter((l) => l.avg_watts != null && l.avg_watts > 0);
  if (powered.length < 3) {
    return { hasIntervals: false, reason: 'No power data in laps — interval analysis needs a power meter.' };
  }

  const lapPowers = powered.map((l) => l.avg_watts as number);
  const recoveryBaseline = percentile(lapPowers, 25); // easy/warm-up/recovery level
  const hasFtp = ftp > 0;

  const isWork = (l: Lap): boolean => {
    if (l.avg_watts == null || l.avg_watts <= 0) return false;
    const aboveEasy = l.avg_watts >= recoveryBaseline * 1.15;
    const hardEnough = hasFtp ? l.avg_watts / ftp >= 0.83 : true;
    // Ignore very short laps (< 20s) — usually accidental lap presses, not reps.
    const longEnough = l.duration_s >= 20;
    return aboveEasy && hardEnough && longEnough;
  };

  const workLaps = laps.filter(isWork);
  const recoveryLaps = powered.filter((l) => !isWork(l));

  if (workLaps.length < 2) {
    return { hasIntervals: false, reason: 'No repeated work intervals detected in this ride.' };
  }

  const reps: IntervalRep[] = workLaps.map((l, i) => ({
    rep: i + 1,
    lap_index: l.index,
    duration_s: l.duration_s,
    avg_watts: l.avg_watts,
    pct_ftp: hasFtp && l.avg_watts != null ? Math.round((l.avg_watts / ftp) * 100) : null,
    avg_hr: l.avg_hr,
    avg_cadence: l.avg_cadence,
  }));

  const repPowers = reps.map((r) => r.avg_watts as number);
  const avgPower = Math.round(mean(repPowers));
  const first = repPowers[0];
  const last = repPowers[repPowers.length - 1];
  const fadePct = first > 0 ? Math.round(((first - last) / first) * 1000) / 10 : null;

  const strongestRep = reps[repPowers.indexOf(Math.max(...repPowers))].rep;
  const weakestRep = reps[repPowers.indexOf(Math.min(...repPowers))].rep;
  const cvPct = avgPower > 0 ? Math.round((stdev(repPowers) / avgPower) * 1000) / 10 : null;

  const repHrs = reps.map((r) => r.avg_hr).filter((h): h is number => h != null);
  const hrDrift =
    reps[0].avg_hr != null && reps[reps.length - 1].avg_hr != null
      ? Math.round((reps[reps.length - 1].avg_hr as number) - (reps[0].avg_hr as number))
      : null;

  const repCadences = reps.map((r) => r.avg_cadence).filter((c): c is number => c != null);
  const recoveryPowers = recoveryLaps.map((l) => l.avg_watts as number);

  // Structure label — "N × M:SS" when rep durations are uniform, else a range.
  const durations = reps.map((r) => r.duration_s);
  const durMin = Math.min(...durations);
  const durMax = Math.max(...durations);
  const uniform = durMax - durMin <= Math.max(10, durMin * 0.15);
  const structureLabel = uniform
    ? `${reps.length} × ${fmtMMSS(Math.round(mean(durations)))}`
    : `${reps.length} reps (${fmtMMSS(durMin)}–${fmtMMSS(durMax)})`;

  return {
    hasIntervals: true,
    ftp: hasFtp ? ftp : undefined,
    structure_label: structureLabel,
    rep_count: reps.length,
    reps,
    summary: {
      avg_power: avgPower,
      avg_pct_ftp: hasFtp ? Math.round((avgPower / ftp) * 100) : null,
      avg_hr: repHrs.length ? Math.round(mean(repHrs)) : null,
      avg_cadence: repCadences.length ? Math.round(mean(repCadences)) : null,
      avg_duration_s: Math.round(mean(durations)),
      fade_pct: fadePct,
      strongest_rep: strongestRep,
      weakest_rep: weakestRep,
      consistency_cv_pct: cvPct,
      hr_drift_bpm: hrDrift,
      avg_recovery_power: recoveryPowers.length ? Math.round(mean(recoveryPowers)) : null,
    },
  };
}
