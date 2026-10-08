/**
 * Plan-quality eval: builds plans for a spread of athlete archetypes and grades
 * each against coaching rules (planQualityService). Exits non-zero if any
 * archetype fails a critical rule.
 *
 * Two modes:
 *  - default: the deterministic fallback generator (offline, free, CI-safe)
 *  - --designer: the LIVE Opus plan designer (the primary production path).
 *    Costs one Opus call per archetype; needs ANTHROPIC_API_KEY in backend/.env.
 *
 * Only the DB touchpoints are mocked (athlete row, preferences, CTL, power PRs).
 *
 * Run: npm run eval:plans               (deterministic)
 *      npm run eval:plans:designer      (live Opus)
 *      add `-- -v` to print every week of every plan
 *      add `-- --only=stage` to run archetypes whose name contains "stage"
 */
import { trainingPlanService } from '../services/trainingPlanService';
import { aiPlanDesignerService } from '../services/aiPlanDesignerService';
import { athletePreferencesService } from '../services/athletePreferencesService';
import { trainingLoadService } from '../services/trainingLoadService';
import { powerAnalysisService } from '../services/powerAnalysisService';
import { supabaseAdmin } from '../utils/supabase';
import { gradePlan, summarize } from '../services/planQualityService';
import { Level } from '../utils/coachingLevels';
import { TrainingPlan } from '../types/trainingPlan';

const VERBOSE = process.argv.includes('-v');
const DESIGNER = process.argv.includes('--designer');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).toLowerCase();
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

interface Archetype {
  name: string;
  goal: string;
  level: Level;
  ftp: number;
  weightKg: number;
  age: number;
  ctl: number;
  intensityPreference?: string;
  eventKind?: string;
  weeksOut: number;
  /** Power records (W) — drives the designer's power-profile analysis. */
  prs?: { s5?: number; m1?: number; m5?: number; m20?: number };
  expectEmphasis?: 'vo2max' | 'sprint';
  /** Recurring weekly commitments (e.g. Tuesday ZRL race). */
  fixed?: { day: string; kind: 'race' | 'hard_group_ride' | 'easy_group_ride'; duration_hours?: number; name?: string }[];
  daily: Partial<Record<string, number>>;
}

const ARCHETYPES: Archetype[] = [
  { name: 'Beginner, 5h, 4 days, gran fondo', goal: 'First 100km gran fondo', level: 'beginner',
    ftp: 160, weightKg: 80, age: 34, ctl: 20, eventKind: 'gran_fondo', weeksOut: 12,
    daily: { tuesday: 1, thursday: 1, saturday: 2, sunday: 1 } },
  { name: 'Beginner, every day open (8h)', goal: 'Complete a hilly 80-mile charity ride', level: 'beginner',
    ftp: 170, weightKg: 85, age: 41, ctl: 25, eventKind: 'gran_fondo', weeksOut: 12,
    daily: { monday: 1, tuesday: 1, wednesday: 1, thursday: 1, friday: 1, saturday: 2, sunday: 1 } },
  { name: 'Fast newbie 3.9 W/kg, 6h', goal: 'First criterium (Cat 5)', level: 'beginner',
    ftp: 290, weightKg: 74, age: 27, ctl: 40, eventKind: 'crit', weeksOut: 10,
    daily: { tuesday: 1.5, wednesday: 1, thursday: 1.5, saturday: 2 } },
  { name: 'Intermediate, 9h, century', goal: 'Century ride (100 miles) with ~6000ft climbing', level: 'intermediate',
    ftp: 230, weightKg: 75, age: 38, ctl: 50, eventKind: 'gran_fondo', weeksOut: 16,
    daily: { tuesday: 1.5, wednesday: 1, thursday: 1.5, saturday: 3, sunday: 2 } },
  { name: 'Masters 52yo intermediate, 8h, crit', goal: 'Masters 50+ criterium series', level: 'intermediate',
    ftp: 240, weightKg: 72, age: 52, ctl: 55, eventKind: 'crit', weeksOut: 12,
    daily: { monday: 1, tuesday: 1.5, wednesday: 1, thursday: 1.5, saturday: 2, sunday: 1 } },
  { name: 'Advanced stage racer (Brandon-like), 10h, Sun off', goal: '6-day stage race, sprint/points focus',
    level: 'advanced', ftp: 299, weightKg: 71, age: 38, ctl: 70, intensityPreference: 'prefers-volume',
    eventKind: 'stage_race', weeksOut: 10,
    fixed: [{ day: 'tuesday', kind: 'race', duration_hours: 1.5, name: 'ZRL race' }],
    daily: { monday: 1.5, tuesday: 2, wednesday: 1.5, thursday: 2, friday: 1, saturday: 2 } },
  { name: 'Advanced, 14h, 7 days, stage race', goal: '4-day road stage race (Cat 2)', level: 'advanced',
    ftp: 340, weightKg: 70, age: 30, ctl: 95, eventKind: 'stage_race', weeksOut: 16,
    daily: { monday: 1, tuesday: 2.5, wednesday: 2, thursday: 2.5, friday: 1, saturday: 4, sunday: 3 } },
  { name: 'Returning racer (advanced, detrained), 7h', goal: 'Return to racing: local crits', level: 'advanced',
    ftp: 250, weightKg: 78, age: 45, ctl: 22, eventKind: 'crit', weeksOut: 12,
    daily: { tuesday: 1.5, wednesday: 1, thursday: 1.5, saturday: 2, sunday: 1 } },
  { name: 'Sprinter, hilly road race (VO2 limiter)', goal: 'Hilly road race (Cat 3) — repeated 4–6 min climbs, small-group finish',
    level: 'intermediate', ftp: 260, weightKg: 75, age: 33, ctl: 60, eventKind: 'road_race', weeksOut: 12,
    prs: { s5: 1300, m1: 520, m5: 285, m20: 272 }, expectEmphasis: 'vo2max',
    daily: { tuesday: 1.5, wednesday: 1, thursday: 1.5, saturday: 3, sunday: 2 } },
  { name: 'Climber, crit with sprint finish (sprint limiter)', goal: 'Criterium series — always ends in a bunch sprint',
    level: 'intermediate', ftp: 280, weightKg: 62, age: 29, ctl: 60, eventKind: 'crit', weeksOut: 12,
    prs: { s5: 700, m1: 450, m5: 370, m20: 295 }, expectEmphasis: 'sprint',
    daily: { tuesday: 1.5, wednesday: 1, thursday: 1.5, saturday: 3, sunday: 2 } },
];

const selected = ARCHETYPES.filter((a) => !ONLY || a.name.toLowerCase().includes(ONLY));
const byId = (id: string) => selected[Number(id.replace('eval-', ''))];

// ---- Mock the DB touchpoints, keyed by athleteId so designer runs can go in parallel ----
(supabaseAdmin as any).from = () => {
  let id = '';
  const b: any = {
    select: () => b,
    eq: (_col: string, val: string) => { id = val; return b; },
    single: async () => {
      const a = byId(id);
      const dob = new Date(); dob.setFullYear(dob.getFullYear() - a.age);
      return {
        data: {
          ftp: a.ftp, weight_kg: a.weightKg, experience_level: a.level, unit_system: 'imperial',
          timezone: 'America/Denver', full_name: 'Eval Athlete', date_of_birth: dob.toISOString().split('T')[0],
          max_hr: null, resting_hr: null, preferences: { intensity_preference: a.intensityPreference },
        },
        error: null,
      };
    },
  };
  return b;
};
(athletePreferencesService as any).getPreferences = async (id: string) => ({ intensity_preference: byId(id).intensityPreference });
(trainingPlanService as any).estimateCurrentCTL = async (id: string) => byId(id).ctl;
(trainingLoadService as any).calculateTrainingLoad = async (id: string) => ({ ctl: byId(id).ctl, atl: byId(id).ctl, tsb: 0 });
(powerAnalysisService as any).getPersonalRecords = async (id: string) => {
  const pr = byId(id).prs;
  if (!pr) return null;
  const rec = (power?: number) => ({ power: power || 0 });
  return { power_5sec: rec(pr.s5), power_1min: rec(pr.m1), power_5min: rec(pr.m5), power_20min: rec(pr.m20) };
};

async function build(a: Archetype, id: string, daily: Record<string, number>): Promise<TrainingPlan> {
  const eventDate = new Date();
  eventDate.setDate(eventDate.getDate() + a.weeksOut * 7);
  if (DESIGNER) {
    return aiPlanDesignerService.designPlan(id, {
      goal_event: a.goal, event_date: eventDate.toISOString().split('T')[0], daily_hours: daily, fixed_sessions: a.fixed,
    });
  }
  return trainingPlanService.generatePlan(id, {
    goal_event: a.goal, event_date: eventDate, current_fitness_level: a.level, weekly_hours: 0,
    strengths: [], weaknesses: [], preferences: { indoor_outdoor: 'both', zwift_availability: false },
    daily_hours: daily, fixed_sessions: a.fixed,
  } as any);
}

(async () => {
  console.log(`Plan-quality eval — ${DESIGNER ? 'LIVE Opus designer' : 'deterministic generator'}, ${selected.length} archetypes`);
  const results = await Promise.all(selected.map(async (a, i) => {
    const daily: Record<string, number> = Object.fromEntries(DOW.map((d) => [d, a.daily[d] ?? 0]));
    try {
      return { a, daily, plan: await build(a, `eval-${i}`, daily) };
    } catch (e: any) {
      return { a, daily, error: e?.message || String(e) };
    }
  }));

  let criticalFailures = 0;
  for (const r of results) {
    if (!('plan' in r) || !r.plan) {
      criticalFailures++;
      console.log(`\n✗ ${r.a.name}  — BUILD FAILED: ${(r as any).error}`);
      continue;
    }
    const { a, plan, daily } = r;
    const capByDay = Object.fromEntries(DOW.map((d, i) => [i, daily[d]]));
    const findings = gradePlan(plan, { level: a.level, intensityPreference: a.intensityPreference, capByDay, eventKind: a.eventKind, ctl: a.ctl, ftpTesting: true, expectEmphasis: a.expectEmphasis,
      fixedDays: (a.fixed || []).map((f) => DOW.indexOf(f.day)) });
    const { failedCritical, failedWarn, score } = summarize(findings);
    criticalFailures += failedCritical.length;

    const mark = failedCritical.length ? '✗' : failedWarn.length ? '~' : '✓';
    console.log(`\n${mark} ${a.name}  — ${plan.weeks.length} wks, score ${score}%`);
    for (const f of [...failedCritical, ...failedWarn]) {
      console.log(`    ${f.severity === 'critical' ? 'CRIT' : 'warn'}  ${f.rule}: ${f.detail}`);
    }
    if (VERBOSE) {
      for (const w of plan.weeks) {
        const mins = w.workouts.reduce((s, x) => s + x.duration_minutes, 0);
        console.log(`      wk${w.week_number} ${w.phase.padEnd(5)} ${(mins / 60).toFixed(1)}h  ` +
          w.workouts.map((x) => `${DOW[x.day_of_week].slice(0, 3)}:${x.workout_type}${x.duration_minutes}`).join(' '));
      }
    }
  }
  console.log(`\n${criticalFailures === 0 ? 'ALL ARCHETYPES PASS critical rules' : `${criticalFailures} critical failure(s)`}`);
  process.exit(criticalFailures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
