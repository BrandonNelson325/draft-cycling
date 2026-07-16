import { anthropic, OPUS } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { powerAnalysisService } from './powerAnalysisService';
import {
  availableDaysFromDailyHours,
  nextMondayIso,
  normalizeAiPlan,
} from './trainingPlanService';
import { TrainingPlan } from '../types/trainingPlan';

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
                    enum: ['recovery', 'endurance', 'tempo', 'sweet_spot', 'threshold', 'vo2max', 'anaerobic'],
                  },
                  duration_minutes: { type: 'number' },
                  reps: { type: 'number', description: 'For interval sessions (tempo/sweet_spot/threshold/vo2max/anaerobic): number of work intervals, e.g. 2 for a 2×12. Omit for steady endurance/recovery rides.' },
                  work_minutes: { type: 'number', description: 'Length of EACH work interval in minutes, e.g. 12 for a 2×12. Omit for steady rides.' },
                  rest_minutes: { type: 'number', description: 'Easy recovery between work intervals, in minutes (e.g. 4). Omit for steady rides.' },
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
      .select('ftp, weight_kg, experience_level, unit_system, timezone, full_name')
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
      }
    } catch { /* optional */ }

    const wkg = athlete.weight_kg ? (athlete.ftp / athlete.weight_kg).toFixed(2) : null;
    const availLines = availableDays
      .slice()
      .sort((a, b) => a.day - b.day)
      .map((d) => `  - ${DAY_NAMES[d.day]}: up to ${d.cap}h`)
      .join('\n');
    const biggestDay = availableDays[0]; // pre-sorted by cap desc

    const system = `You are a world-class cycling coach designing a complete, periodized training plan. You think like a pro coach: every single session is deliberate and has a clear purpose. You will return the plan by calling the submit_training_plan tool.`;

    const userPrompt = `Design a ${weeksUntil}-week plan for this athlete.

GOAL: ${params.goal_event}${params.event_date ? ` on ${params.event_date}` : ''}
${params.route_notes ? `ROUTE / RACE NOTES: ${params.route_notes}\n` : ''}${params.strengths?.length ? `Strengths: ${params.strengths.join(', ')}\n` : ''}${params.weaknesses?.length ? `Focus areas / weaknesses: ${params.weaknesses.join(', ')}\n` : ''}
ATHLETE:
- FTP: ${athlete.ftp}W${wkg ? ` (${wkg} W/kg)` : ''}
- Experience: ${athlete.experience_level || 'unknown'}
- ${powerLine || 'Limited power-record data.'}

PLAN WINDOW: starts ${startIso} (a Monday), event ${eventIso}, ${weeksUntil} weeks.

AVAILABILITY — train ONLY these days, and NEVER prescribe more time than each day allows:
${availLines}
The day with the most time is ${DAY_NAMES[biggestDay.day]} (${biggestDay.cap}h) — put the long ride there. Any day not listed is a full rest day; do not schedule it.

DESIGN REQUIREMENTS:
1. Periodize properly: base → build → peak → taper, with progressive overload and a recovery week roughly every 3–4 weeks (lighter, not fewer days).
2. Use ALL available days each week. Extra days beyond the key sessions are easy aerobic endurance. Place recovery rides deliberately (e.g. the day after hard work). Hard days may run back-to-back if intentional.
3. Make the TAPER race-specific: in the final 1–2 weeks cut volume sharply but KEEP intensity with short race-pace work; the day or two before the event should be short "openers" (20–40 min with a few race-pace primers), not generic recovery.
4. Tailor to the athlete's FTP, experience, strengths/weaknesses, and the route (e.g. lots of climbing → more threshold/tempo and long climbing-style endurance).
5. Every workout needs a one-sentence rationale that a smart athlete would respect.
6. duration_minutes must fit within that day's available hours.
7. For INTERVAL sessions (tempo/sweet_spot/threshold/vo2max/anaerobic), prescribe the exact structure with reps + work_minutes + rest_minutes (e.g. a 2×12 sweet spot = reps 2, work_minutes 12, rest_minutes 4). We synthesize the intervals at the correct power for the type from these numbers, and the workout is NAMED from them — so the structure you give is what the athlete sees and rides. Make warmup + (reps × (work_minutes + rest_minutes)) + cooldown fit inside duration_minutes; the rest of the time becomes easy spinning. Omit reps/work_minutes/rest_minutes for steady endurance and recovery rides.

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
    });

    logger.info(`[PlanDesigner] Designed ${plan.weeks.length} weeks, ${plan.weeks.reduce((s, w) => s + w.workouts.length, 0)} workouts`);
    return plan;
  },
};
