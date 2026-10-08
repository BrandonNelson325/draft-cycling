/**
 * Single source of truth for how coaching scales with the athlete.
 *
 * TWO AXES — deliberately NOT a single ladder with an "expert" tier:
 *  - TRAINING AGE (experience_level: beginner / intermediate / advanced) →
 *    durability, recovery spacing, how much quality to stack, session size.
 *  - CURRENT CAPACITY (measured: W/kg, CTL, weekly hours) → volume and
 *    intensity tolerance. This is what separates a 3.0 W/kg "advanced" rider
 *    from a 5.5 W/kg one, and catches mismatches a label can't: a returning
 *    ex-racer (high training age, low CTL) or a fast newbie (low training age,
 *    high W/kg).
 *
 * The plan designer, the deterministic fallback, the interval builders AND the
 * plan-quality eval harness all read these SAME numbers, so the harness grades
 * plans against exactly the rules the generators are told to follow.
 */

export type Level = 'beginner' | 'intermediate' | 'advanced';

export function resolveLevel(raw: string | null | undefined): Level {
  return raw === 'beginner' || raw === 'advanced' ? raw : 'intermediate';
}

export interface LevelProfile {
  /** Healthy riding-days range per week. */
  ridingDaysPerWeek: [number, number];
  /** Quality (intensity) sessions in a normal loading week. */
  qualityPerWeek: [number, number];
  /** Minimum hours between quality sessions unless deliberately stacked. */
  minHoursBetweenQuality: number;
  /** Longest permitted run of consecutive quality days. 1 = never stack. */
  maxStackedQuality: number;
  /** Z1 recovery rides allowed in a normal (non-recovery) week. */
  maxRecoveryRidesPerWeek: number;
  /** Where the day-after-hard-work easy ride should be Z1 recovery. */
  recoveryRidePolicy: 'after-every-hard' | 'after-hardest-only';
  /** A recovery week roughly every N weeks. */
  recoveryWeekEvery: number;
  /** Default session size (reps) per interval type when none is prescribed. */
  defaultReps: Record<string, number>;
  /** Ceiling on total WORK minutes in one session, per type. Clamps any
   *  prescribed structure — works for any rep length (10×1 or 3×20). */
  maxWorkMinutes: Record<string, number>;
}

export const LEVEL_PROFILES: Record<Level, LevelProfile> = {
  beginner: {
    ridingDaysPerWeek: [3, 5],
    qualityPerWeek: [1, 2],
    minHoursBetweenQuality: 48,
    maxStackedQuality: 1,
    maxRecoveryRidesPerWeek: 3,
    recoveryRidePolicy: 'after-every-hard',
    recoveryWeekEvery: 3,
    defaultReps: { vo2max: 4, anaerobic: 6, threshold: 2, sweet_spot: 2, tempo: 2, sprint: 4 },
    maxWorkMinutes: { vo2max: 14, anaerobic: 5, threshold: 25, sweet_spot: 30, tempo: 40, sprint: 1.5 },
  },
  intermediate: {
    ridingDaysPerWeek: [4, 6],
    qualityPerWeek: [2, 3],
    minHoursBetweenQuality: 24,
    maxStackedQuality: 2,
    maxRecoveryRidesPerWeek: 2,
    recoveryRidePolicy: 'after-hardest-only',
    recoveryWeekEvery: 4,
    defaultReps: { vo2max: 5, anaerobic: 8, threshold: 3, sweet_spot: 3, tempo: 3, sprint: 6 },
    maxWorkMinutes: { vo2max: 22, anaerobic: 8, threshold: 40, sweet_spot: 50, tempo: 60, sprint: 2.5 },
  },
  advanced: {
    ridingDaysPerWeek: [5, 7],
    qualityPerWeek: [2, 4],
    minHoursBetweenQuality: 0,
    maxStackedQuality: 3,
    maxRecoveryRidesPerWeek: 1,
    recoveryRidePolicy: 'after-hardest-only',
    recoveryWeekEvery: 4,
    defaultReps: { vo2max: 6, anaerobic: 10, threshold: 4, sweet_spot: 3, tempo: 4, sprint: 8 },
    maxWorkMinutes: { vo2max: 32, anaerobic: 12, threshold: 60, sweet_spot: 75, tempo: 90, sprint: 3.5 },
  },
};

/**
 * Z1 recovery rides allowed in a loading week, after preference modifiers.
 * A "prefers-volume" rider gets one fewer — their easy days stay Z2.
 */
export function recoveryRideAllowance(level: Level, intensityPreference?: string | null): number {
  const base = LEVEL_PROFILES[level].maxRecoveryRidesPerWeek;
  return intensityPreference === 'prefers-volume' ? Math.max(0, base - 1) : base;
}

/** Prompt block: how to coach this training age. */
export function levelGuidance(level: Level, intensityPreference?: string | null): string {
  const p = LEVEL_PROFILES[level];
  const recovery = recoveryRideAllowance(level, intensityPreference);
  const sessions = Object.entries(p.defaultReps)
    .map(([t, r]) => `${t} ~${r} reps (≤${p.maxWorkMinutes[t]} min of work)`)
    .join(', ');
  const stacking =
    p.maxStackedQuality <= 1
      ? 'NEVER put quality sessions on consecutive days.'
      : `Up to ${p.maxStackedQuality} consecutive quality days are fine when deliberate (a block), followed by real recovery.`;
  const spacing = p.minHoursBetweenQuality
    ? `Otherwise leave ~${p.minHoursBetweenQuality}h between quality sessions.`
    : 'Spacing between quality days is driven by the plan, not a fixed gap.';
  return `TRAINING-AGE GUIDANCE (${level.toUpperCase()}):
- Ride ${p.ridingDaysPerWeek[0]}–${p.ridingDaysPerWeek[1]} days/week (within availability); ${p.qualityPerWeek[0]}–${p.qualityPerWeek[1]} quality sessions in a loading week.
- ${stacking} ${spacing}
- Easy days are Z2 endurance by default. Z1 recovery rides in a loading week: at most ${recovery}${recovery === 0 ? ' (keep easy days Z2; save Z1 for recovery weeks)' : p.recoveryRidePolicy === 'after-every-hard' ? ', typically the day after hard work' : ', only after the hardest effort of the week'}. Exception: a Z1 ride straight after a deliberate 2+ day quality block is always appropriate.
- Recovery week roughly every ${p.recoveryWeekEvery} weeks.
- Session size: ${sessions}. Don't exceed these work ceilings.`;
}

/** Prompt block: what the athlete's MEASURED capacity says, incl. mismatches. */
export function capacityGuidance(input: {
  level: Level;
  wkg?: number | null;
  ctl?: number | null;
  weeklyHours?: number | null;
}): string {
  const lines: string[] = [];
  const { level, wkg, ctl, weeklyHours } = input;

  if (wkg != null) {
    const band =
      wkg < 2.0 ? 'true beginner engine — prioritize consistency and frequency over intensity'
      : wkg < 3.0 ? 'developing — structured training (sweet spot especially) yields fast gains'
      : wkg < 4.0 ? 'strong amateur — ready for full periodization, VO2 and race-specific work'
      : wkg < 5.0 ? 'competitive — needs targeted, specific training; general volume has diminishing returns'
      : 'elite — highly individualized; focus on weaknesses and race demands';
    lines.push(`- ${wkg.toFixed(2)} W/kg: ${band}.`);
  }
  if (ctl != null) {
    lines.push(`- Current fitness (CTL) ≈ ${Math.round(ctl)}. Start the plan's load near this and ramp from it — not from where the athlete "should" be.`);
  }
  if (weeklyHours != null) {
    lines.push(`- ~${weeklyHours} h/week available.`);
  }

  // Mismatches between training age and capacity — the cases a single label
  // gets wrong, and the reason this is two axes rather than an "expert" tier.
  if (level === 'beginner' && wkg != null && wkg >= 3.5) {
    lines.push('- MISMATCH — fast newbie: a big engine on young tendons and an unadapted recovery system. Intensity tolerance is high, but progress frequency and volume cautiously and keep the beginner recovery spacing.');
  }
  if (level === 'advanced' && ctl != null && ctl < 30) {
    lines.push('- MISMATCH — experienced but currently detrained: structure and harder sessions are fine, but rebuild LOAD gradually; do not start at their former volume.');
  }

  return lines.length ? `CURRENT CAPACITY (measured):\n${lines.join('\n')}` : '';
}

/**
 * On-bike fueling for a session, or null when none is needed (< ~75 min).
 * Under-fueling is one of the most common reasons amateurs fade late in races,
 * and the gut is trainable — so long training rides practice race fueling.
 * Ranges rise with training age (beginners' guts aren't trained for 90 g/h).
 */
export function fuelingNote(durationMinutes: number, isQuality: boolean, level: Level): string | null {
  if (durationMinutes < (isQuality ? 75 : 90)) return null;
  const [lo, hi] = level === 'beginner' ? [40, 60] : level === 'intermediate' ? [60, 80] : [80, 100];
  const long = durationMinutes >= 150;
  return `Fuel: ~${lo}–${hi} g carbs/hour from the first 20 min (bottles + food), plus fluids to thirst` +
    (long ? ' — treat it as race-fueling practice.' : '.');
}

/**
 * Read the power profile against FTP — strengths and limiters, not just watts.
 * Ratios rather than absolute watts so it works for any size/level of rider.
 * Bands are typical trained-amateur ranges; outliers matter, not decimals.
 * `prs` = powerAnalysisService.getPersonalRecords() shape ({ power_5sec: { power } …}).
 */
export type Limiter = 'sprint' | 'anaerobic' | 'vo2max';

export function analyzePowerProfile(prs: any, ftp: number | null | undefined, weightKg?: number | null): {
  lines: string[]; strengths: string[]; limiters: Limiter[]; limiterLabels: string[];
} {
  const out = { lines: [] as string[], strengths: [] as string[], limiters: [] as Limiter[], limiterLabels: [] as string[] };
  if (!prs || !ftp) return out;
  const p = (k: string) => Number(prs?.[k]?.power) || 0;
  const s5 = p('power_5sec');
  if (s5 && weightKg) {
    const wkg = s5 / weightKg;
    out.lines.push(`5s sprint ${s5}W (${wkg.toFixed(1)} W/kg)`);
    if (wkg >= 17) out.strengths.push('sprint');
    else if (wkg < 12) { out.limiters.push('sprint'); out.limiterLabels.push('sprint / neuromuscular power'); }
  }
  const m1 = p('power_1min');
  if (m1) {
    const r = m1 / ftp;
    out.lines.push(`1min ${m1}W (${r.toFixed(2)}× FTP)`);
    if (r >= 1.9) out.strengths.push('anaerobic capacity (punchy)');
    else if (r < 1.5) { out.limiters.push('anaerobic'); out.limiterLabels.push('anaerobic capacity (1-min efforts)'); }
  }
  const m5 = p('power_5min');
  if (m5) {
    const r = m5 / ftp;
    out.lines.push(`5min ${m5}W (${r.toFixed(2)}× FTP)`);
    if (r >= 1.3) out.strengths.push('VO2max');
    else if (r < 1.12) { out.limiters.push('vo2max'); out.limiterLabels.push('VO2max (5-min power)'); }
  }
  const m20 = p('power_20min');
  if (m20) out.lines.push(`20min ${m20}W`);
  return out;
}

/** Which limiters an event actually punishes, most decisive first. */
export function eventRelevantLimiter(limiters: Limiter[], eventKind: string): Limiter | null {
  const demands: Record<string, Limiter[]> = {
    crit: ['sprint', 'anaerobic', 'vo2max'],
    road_race: ['vo2max', 'anaerobic', 'sprint'],
    stage_race: ['vo2max', 'anaerobic', 'sprint'],
    endurance_event: ['vo2max'],
    general: ['vo2max'],
    time_trial: [],
  };
  return (demands[eventKind] || []).find((l) => limiters.includes(l)) ?? null;
}

/**
 * Read the power profile against FTP — strengths and limiters, not just watts.
 * Ratios rather than absolute watts so it works for any size/level of rider.
 * Bands are typical trained-amateur ranges; outliers matter, not decimals.
 * `prs` = powerAnalysisService.getPersonalRecords() shape ({ power_5sec: { power } …}).
 */
export function powerProfileGuidance(prs: any, ftp: number | null | undefined, weightKg?: number | null): string {
  const a = analyzePowerProfile(prs, ftp, weightKg);
  if (!a.lines.length) return '';
  const out = [`POWER PROFILE (all-time bests vs current FTP ${ftp}W): ${a.lines.join(', ')}.`];
  if (a.strengths.length) out.push(`- Strengths: ${a.strengths.join(', ')} — keep sharp, and build race tactics around them.`);
  if (a.limiterLabels.length) out.push(`- Likely limiters: ${a.limiterLabels.join(', ')}. If the EVENT demands one, it gets priority in build/peak (at least one session most weeks). (A low number can also mean it was never tested — include the effort rather than assume.)`);
  out.push('- Bests may be old; current FTP is the anchor for intensity.');
  return out.join('\n');
}
