import { anthropic, OPUS } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { powerAnalysisService } from './powerAnalysisService';
import {
  availableDaysFromDailyHours,
  nextMondayIso,
  normalizeAiPlan,
  scheduleFtpTests,
  normalizeFixedSessions,
  applyFixedSessions,
  enforceLevelInvariants,
  addFuelingGuidance,
} from './trainingPlanService';
import { TrainingPlan } from '../types/trainingPlan';
import { ageFromDob, mastersGuidance } from '../utils/age';
import { resolveLevel, levelGuidance, capacityGuidance, powerProfileGuidance } from '../utils/coachingLevels';
import { trainingLoadService } from './trainingLoadService';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Opus 4.8 designs the actual periodized plan — every workout reasoned for THIS
 * athlete, goal, and availability. The model makes the coaching decisions
 * (phase structure, workout type/duration/day, race-specific taper, rationale);
 * code (normalizeAiPlan) enforces the hard invariants (only available days,
 * never exceed a day's time, valid intervals). If anything fails, the caller
 * falls back to the deterministic generator, so a build can never fail outright.
 */
const SUBMIT_PLAN_TOOL = {
  name: 'submit_training_plan',
  description: 'Submit the finished week-by-week training plan.',
  input_schema: {
    type: 'object' as const,
    properties: {
      weeks: {
        type: 'array',
        description: 'Every week of the plan, in order, from the start date to race week.',
        items: {
          type: 'object',
          properties: {
            week_number: { type: 'number' },
            phase: { type: 'string', enum: ['base', 'build', 'peak', 'taper'] },
            focus: { type: 'string', description: 'One short line on this week’s purpose.' },
            workouts: {
              type: 'array',
              description: 'One entry per training day this week. Only use the athlete’s available days.',
              items: {
                type: 'object',
                properties: {
                  day_of_week: { type: 'number', description: '0=Sun … 6=Sat' },
                  workout_type: {
                    type: 'string',
                    enum: ['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic', 'sprint'],
                    description: 'anaerobic = 30s–2min efforts above VO2 (Z6). sprint = 8–20s MAXIMAL neuromuscular sprints with full (4–5 min) recovery.',
                  },
                  duration_minutes: { type: 'number' },
                  reps: { type: 'number', description: 'For interval sessions (tempo/sweet_spot/threshold/vo2max/anaerobic/sprint): number of work intervals, e.g. 2 for a 2×12. Omit for steady endurance/recovery rides.' },
                  work_minutes: { type: 'number', description: 'Length of EACH work interval in minutes, e.g. 12 for a 2×12; fractions allowed for short efforts (0.25 = 15s sprint, 0.5 = 30s). Omit for steady rides.' },
                  rest_minutes: { type: 'number', description: 'Easy recovery between work intervals, in minutes (e.g. 4). Omit for steady rides.' },
                  format: {
                    type: 'string',
                    enum: ['standard', 'over_under', 'micro', 'surges', 'late'],
                    description: 'Race-specific session shape (default standard). over_under (threshold/sweet_spot): each rep alternates 2′ under / 1′ over. micro (vo2max): work_minutes = length of a 30/30s set. surges (tempo/sweet_spot/threshold): steady rep with a 15s kick every 2 min. late (sprint/anaerobic/vo2max/threshold): the set is ridden at the END of the ride, after the aerobic block — on tired legs.',
                  },
                  name: { type: 'string', description: 'Short, specific workout name.' },
                  rationale: { type: 'string', description: 'One sentence: why THIS workout on THIS day.' },
                },
                required: ['day_of_week', 'workout_type', 'duration_minutes', 'name', 'rationale'],
              },
            },
          },
          required: ['week_number', 'phase', 'workouts'],
        },
      },
    },
    required: ['weeks'],
  },
};

export const aiPlanDesignerService = {
  /**
   * Design a full plan with Opus 4.8. Throws on any failure so the background
   * job can fall back to the deterministic generator.
   */
  async designPlan(athleteId: string, params: any): Promise<TrainingPlan> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('ftp, weight_kg, experience_level, unit_system, timezone, full_name, date_of_birth, max_hr, resting_hr, preferences')
      .eq('id', athleteId)
      .single();

    if (!athlete?.ftp) throw new Error('Athlete FTP not set');

    const dailyHours = params.daily_hours as Record<string, number> | undefined;
    const availableDays = dailyHours ? availableDaysFromDailyHours(dailyHours) : [];
    if (availableDays.length === 0) {
      throw new Error('No per-day availability provided — designer requires daily_hours');
    }

    const tz = athlete.timezone || 'America/Los_Angeles';
    const todayIso = (() => {
      try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); }
      catch { return new Date().toISOString().split('T')[0]; }
    })();
    const eventIso: string = params.event_date;
    const startIso: string = params.start_date || nextMondayIso(todayIso);

    const weeksUntil = Math.max(
      1,
      Math.round((new Date(eventIso + 'T12:00:00').getTime() - new Date(startIso + 'T12:00:00').getTime()) / (7 * 86400000))
    );
    if (weeksUntil < 4) throw new Error('Need at least 4 weeks for a designed plan');

    // Power profile for phenotype-aware design (best-effort).
    let powerLine = '';
    let profileBlock = '';
    try {
      const pr: any = await powerAnalysisService.getPersonalRecords(athleteId);
      if (pr) {
        const parts = [
          pr.power_1min?.power && `1min ${pr.power_1min.power}W`,
          pr.power_5min?.power && `5min ${pr.power_5min.power}W`,
          pr.power_20min?.power && `20min ${pr.power_20min.power}W`,
          pr.power_60min?.power && `60min ${pr.power_60min.power}W`,
        ].filter(Boolean);
        if (parts.length) powerLine = `Power records: ${parts.join(', ')}.`;
        profileBlock = powerProfileGuidance(pr, athlete.ftp, athlete.weight_kg);
      }
    } catch { /* optional */ }

    const wkg = athlete.weight_kg ? (athlete.ftp / athlete.weight_kg).toFixed(2) : null;
    const age = ageFromDob(athlete.date_of_birth);
    const mastersBlock = mastersGuidance(age);
    const availLines = availableDays
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((d) => `  - ${DAY_NAMES[d.day]}: up to ${d.cap}h`)
      .join('\n');
    const biggestDay = availableDays[0]; // pre-sorted by cap desc

    // Athlete training preferences — previously never passed to the designer,
    // so it defaulted to a Z1 recovery ride after every hard day regardless of
    // a "prefers volume" advanced rider.
    const prefs = (athlete as any).preferences || {};
    const prefLines = [
      prefs.intensity_preference && `- Intensity preference: ${prefs.intensity_preference}`,
      Array.isArray(prefs.preferred_workout_types) && prefs.preferred_workout_types.length &&
        `- Preferred workout types: ${prefs.preferred_workout_types.join(', ')}`,
    ].filter(Boolean).join('\n');

    // BOTH AXES. Training age (experience_level) governs recovery/stacking/
    // session size; measured capacity (W/kg, CTL, hours) governs load. The plan
    // designer used to get only the word "advanced" — less coaching context than
    // the chat coach had. These blocks come from the same source of truth the
    // fallback generator and the plan-quality eval harness use.
    const level = resolveLevel(athlete.experience_level);
    const fixedForPrompt = normalizeFixedSessions(params.fixed_sessions);
    const fixedBlock = fixedForPrompt.length
      ? `FIXED WEEKLY COMMITMENTS (the athlete does these every week — they are placed automatically; do NOT schedule anything else on these days):\n${fixedForPrompt
          .map((f) => `- ${f.day}: ${f.name || f.kind}${f.duration_hours ? ` (~${f.duration_hours}h)` : ''} — ${f.kind === 'easy_group_ride' ? 'easy aerobic volume' : 'HARD: counts as one of the week\'s quality sessions; plan the days around it (no hard session the day before for non-advanced athletes; the day after is easy or a deliberate block)'}`)
          .join('\n')}\n\n`
      : '';
    let ctl: number | null = null;
    try {
      const load = await trainingLoadService.calculateTrainingLoad(athleteId);
      ctl = load?.ctl ?? null;
    } catch { /* optional */ }
    const weeklyHours = Math.round(availableDays.reduce((s, d) => s + d.cap, 0) * 10) / 10;
    const levelBlock = levelGuidance(level, prefs.intensity_preference);
    const capacityBlock = capacityGuidance({
      level,
      wkg: athlete.weight_kg ? athlete.ftp / athlete.weight_kg : null,
      ctl,
      weeklyHours,
    });

    const system = `You are a world-class cycling coach designing a complete, periodized training plan. You think like a pro coach: every single session is deliberate and has a clear purpose. You will return the plan by calling the submit_training_plan tool.`;

    const userPrompt = `Design a ${weeksUntil}-week plan for this athlete.

GOAL: ${params.goal_event}${params.event_date ? ` on ${params.event_date}` : ''}
${params.route_notes ? `ROUTE / RACE NOTES: ${params.route_notes}\n` : ''}${params.strengths?.length ? `Strengths: ${params.strengths.join(', ')}\n` : ''}${params.weaknesses?.length ? `Focus areas / weaknesses: ${params.weaknesses.join(', ')}\n` : ''}
ATHLETE:
- FTP: ${athlete.ftp}W${wkg ? ` (${wkg} W/kg)` : ''}
- Experience: ${athlete.experience_level || 'unknown'}
${age ? `- Age: ${age}\n` : ''}${athlete.max_hr ? `- Max HR: ${athlete.max_hr} bpm\n` : ''}- ${powerLine || 'Limited power-record data.'}
${prefLines ? `${prefLines}\n` : ''}
${levelBlock}
${capacityBlock ? `\n${capacityBlock}\n` : ''}${profileBlock ? `\n${profileBlock}\n` : ''}${mastersBlock ? `\n${mastersBlock}` : ''}

PLAN WINDOW: starts ${startIso} (a Monday), event ${eventIso}, ${weeksUntil} weeks.

${fixedBlock}AVAILABILITY — train ONLY these days, and NEVER prescribe more time than each day allows:
${availLines}
The day with the most time is ${DAY_NAMES[biggestDay.day]} (${biggestDay.cap}h) — put the long ride there. Any day not listed is a full rest day; do not schedule it.

DESIGN REQUIREMENTS:
1. Periodize properly: base → build → peak → taper, with progressive overload and a recovery week roughly every 3–4 weeks (lighter, not fewer days).
2. Use the available days, up to the riding-days ceiling in TRAINING-AGE GUIDANCE (a beginner offered 7 days still rides at most 5). Days beyond the key sessions are Z2 ENDURANCE — that's aerobic training, not filler. Hard days may run back-to-back when intentional.
   RECOVERY RIDES (Z1) ARE A TOOL, NOT A DEFAULT: an easy day after a quality session should normally be Z2 endurance. Reserve true Z1 recovery rides for after the HARDEST efforts (races, a back-to-back block, a brutal VO2/anaerobic day) and for recovery weeks, within the limit in TRAINING-AGE GUIDANCE above. Never schedule a Z1 recovery ride on the same weekday every week by reflex.
   Follow the TRAINING-AGE GUIDANCE and CURRENT CAPACITY blocks above for riding days, quality sessions per week, stacking, recovery-ride limits, and session size.
3. Make the TAPER race-specific: in the final 1–2 weeks cut volume sharply but KEEP intensity with short race-pace work; the day or two before the event should be short "openers" (20–40 min with a few race-pace primers), not generic recovery.
4. Tailor to the athlete's FTP, experience, strengths/weaknesses, preferences, and the route (e.g. lots of climbing → more threshold/tempo and long climbing-style endurance).
4a. EVENT SPECIFICITY — training should look more like the event as it approaches:
   - Multi-day / STAGE RACE: in the build phase include deliberate blocks of 2–3 consecutive quality days (training-camp style) to build fatigue resistance — the athlete must produce power on day 4 already tired. Follow each block with real recovery.
   - Sprint / points focus: use workout_type sprint (e.g. 8 × 15s, full recovery). Build peak sprint power on FRESH legs (early in a session, not after a hard block); anaerobic (30s–1min) builds the ability to repeat it.
   - Criterium: repeatable short anaerobic efforts with incomplete recovery — micro (30/30s) VO2 sets and surges sessions.
   - Road / stage race: over_under threshold (holding power through accelerations) and, in build/peak, a weekly "late" session (sprints or a hard effort at the end of a long ride) — races are decided on tired legs. Keep the pure peak-power sprint work on fresh legs too.
   - Race-specific formats are for intermediate/advanced athletes in build/peak; beginners mostly need standard steady reps.
   - USE THE FORMATS: a plan for a racer that only contains standard steady reps is not race-ready.
   - Gran fondo / long road race: the long ride is the key session; build durability.
   - Time trial / TTT: sustained threshold and sweet-spot, race-pace efforts.
5. Every workout needs a one-sentence rationale that a smart athlete would respect.
6. duration_minutes must fit within that day's available hours.
7. For INTERVAL sessions (tempo/sweet_spot/threshold/vo2max/anaerobic/sprint), prescribe the exact structure with reps + work_minutes + rest_minutes (e.g. a 2×12 sweet spot = reps 2, work_minutes 12, rest_minutes 4). We synthesize the intervals at the correct power for the type from these numbers, and the workout is NAMED from them — so the structure you give is what the athlete sees and rides. Make warmup + (reps × (work_minutes + rest_minutes)) + cooldown fit inside duration_minutes; any remaining time is automatically ridden as Z2 ENDURANCE (≈68% FTP) after the set, so a long quality day is "intervals + aerobic endurance" — prescribe the right number of quality reps for the session's purpose rather than padding reps to fill the time. Omit reps/work_minutes/rest_minutes for steady endurance and recovery rides.
8. FTP TESTS are inserted automatically (week 1 and the first loading week of each new block, replacing one quality session) so zones rise as the athlete gets stronger. Don't schedule tests yourself. BETWEEN tests, progress the WORK, not just hours: extend reps or total time-in-zone week to week within a block (e.g. 3×10 → 3×12 → 3×15 threshold; 5×3 → 6×3 → 5×4 VO2).
${mastersBlock ? `8. Honor the AGE-AWARE COACHING guidance above: respect the hard-days-per-week ceiling for this athlete's age, separate hard days with easy/rest days (this overrides the "hard days may run back-to-back" allowance in requirement 2), and give recovery weeks and the taper a touch more room.\n` : ''}
Return the full week-by-week plan via submit_training_plan now.`;

    logger.info(`[PlanDesigner] Designing ${weeksUntil}wk plan for athlete ${athleteId} with Opus`);

    const resp = await anthropic.messages.create({
      model: OPUS,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: userPrompt }],
      tools: [SUBMIT_PLAN_TOOL as any],
      tool_choice: { type: 'tool', name: 'submit_training_plan' } as any,
    });

    const toolUse = resp.content.find((b: any) => b.type === 'tool_use') as any;
    if (!toolUse?.input?.weeks) {
      throw new Error('Designer did not return a plan');
    }

    const plan = normalizeAiPlan(toolUse.input.weeks, availableDays, {
      goal_event: params.goal_event || 'Training Plan',
      eventIso,
      startIso,
      athleteId,
      level, // clamps prescribed interval structures to this training age
      intensityPreference: (athlete as any).preferences?.intensity_preference,
    });
    // Fixed weekly commitments (e.g. a Tuesday race) go on their days and the
    // level's limits are re-enforced around them — the model can't drop them.
    const fixed = normalizeFixedSessions(params.fixed_sessions);
    if (fixed.length) {
      applyFixedSessions(plan.weeks, fixed);
      enforceLevelInvariants(plan.weeks, level, (athlete as any).preferences?.intensity_preference);
    }
    // FTP tests are placed by code (same rule as the fallback), not the model.
    if ((athlete as any).preferences?.ftp_test_preference !== 'ai_estimation') {
      scheduleFtpTests(plan.weeks, new Map(availableDays.map((d) => [d.day, d.cap])), level);
    }
    addFuelingGuidance(plan.weeks, level);

    logger.info(`[PlanDesigner] Designed ${plan.weeks.length} weeks, ${plan.weeks.reduce((s, w) => s + w.workouts.length, 0)} workouts`);
    return plan;
  },
};
