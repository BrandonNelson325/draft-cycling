/**
 * Coach check-ins: the coach notices a PATTERN and reaches out first.
 *
 * Why this exists: the coach only reacted to what was in front of it in a chat.
 * An athlete could rate ten interval sessions "easy", skip every Thursday, or
 * cut every weekday ride short and the plan stayed exactly the same until they
 * happened to ask. A real coach notices and asks why. Each detector below is a
 * pattern a human coach acts on, and each message asks before changing anything.
 *
 * Runs once a day per athlete (early evening local time). At most one check-in
 * per day, none within 3 days of another, a per-kind cooldown, and a kind only
 * re-fires when there is NEW evidence since it last fired — the coach never nags.
 */
import cron from 'node-cron';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { anthropic, SONNET } from '../utils/anthropic';
import { sendPushNotification } from './pushNotificationService';
import { todayInTimezone, utcToLocalDate } from '../utils/timezone';
import { isFtpTestWorkout, isFixedSession } from '../utils/ftpTest';
import { FTP_TEST_NOTE_PREFIX } from './ftpTestService';

export type CheckInKind =
  | 'race_week'
  | 'race_debrief'
  | 'gone_quiet'
  | 'too_hard'
  | 'missed_workouts'
  | 'cut_short'
  | 'too_easy'
  | 'easy_days_too_hard'
  | 'recovery_slump'
  | 'fatigue_creep'
  | 'goal_check'
  | 'great_block';

/** Local hour the daily check runs (early evening — after most rides, before bed). */
export const CHECKIN_HOUR = 18;
/** Days of planned sessions loaded (35 so effort TRENDS have enough sessions). */
const WINDOW_DAYS = 35;
/** No check-in within this many days of the previous one, of any kind. */
const MIN_DAYS_BETWEEN = 3;

const COOLDOWN_DAYS: Record<CheckInKind, number> = {
  race_week: 10,
  race_debrief: 7,
  gone_quiet: 10,
  too_hard: 7,
  missed_workouts: 10,
  cut_short: 14,
  too_easy: 14,
  easy_days_too_hard: 14,
  recovery_slump: 7,
  fatigue_creep: 14,
  goal_check: 35,
  great_block: 28,
};

/** Highest priority first: wellbeing and overload before progression and praise. */
const PRIORITY: CheckInKind[] = [
  'race_week', 'race_debrief',
  'gone_quiet', 'too_hard', 'recovery_slump', 'missed_workouts', 'fatigue_creep',
  'cut_short', 'too_easy', 'easy_days_too_hard', 'goal_check', 'great_block',
];

const EASY_TYPES = new Set(['endurance', 'recovery']);
const STRUGGLE_RE = /could(?:n'?t| not) (?:finish|complete|hold|hit)|had to (?:stop|quit|bail)|bailed|cracked|blew up|gave up|fell apart|too hard|destroyed|cooked|wrecked|died on/i;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** One planned workout in the window, joined to what actually happened. */
export interface Session {
  date: string; // YYYY-MM-DD local
  name: string;
  type: string;
  plannedMin: number | null;
  /** FTP tests and fixed commitments (races, group rides) aren't judged like plan workouts. */
  special: boolean;
  done: boolean;
  rideMin: number | null;
  /** Intensity factor of the actual ride (from TSS + duration). */
  rideIF: number | null;
  rpe: number | null; // 1–5
  notes: string | null;
}

/** One morning's recovery data (WHOOP / intervals.icu / manual check-in). */
export interface WellnessDay {
  date: string;
  readiness: number | null; // 0–100 (WHOOP red < 34)
  sleepHours: number | null;
  sleepQuality: string | null; // terrible | poor | okay | good | great
  feeling: string | null; // exhausted | tired | normal | good | energized
}

export interface EventInfo {
  name: string;
  date: string;
  /** The ride on the event day, if synced. */
  ride?: { minutes: number | null; IF: number | null; rpe: number | null; notes: string | null; debriefed: boolean } | null;
}

export interface CheckInFacts {
  today: string;
  /** Newest first. */
  sessions: Session[];
  daysSinceLastRide: number | null;
  daysSinceFtpTest: number | null;
  experienceLevel: string | null;
  ftp: number | null;
  /** Newest first, last 7 days. */
  wellness?: WellnessDay[];
  /** Target events (active plans + saved goal). */
  events?: EventInfo[];
  /** Active plan, for the periodic goal check. */
  plan?: { goal: string; startDate: string; eventDate: string | null } | null;
  /** Fitness (CTL) now and ~5 weeks ago. */
  ctlNow?: number | null;
  ctl5wAgo?: number | null;
}

export interface CheckIn {
  kind: CheckInKind;
  /** Dates of the sessions that triggered it (for the "new evidence" rule). */
  evidence: string[];
  /** Human-readable facts for the coach prompt. */
  summary: string[];
  /** too_easy only: what the coach should suggest first. */
  suggestion?: 'ftp_test' | 'level_up' | 'harder_block';
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86_400_000);
}

function weekday(date: string): string {
  return DAY_NAMES[new Date(date + 'T12:00:00Z').getUTCDay()];
}

/** "Thursday ×3, Tuesday" — repeated weekdays first, so a pattern stands out. */
function dayPattern(dates: string[]): string {
  const counts = new Map<string, number>();
  dates.forEach((d) => counts.set(weekday(d), (counts.get(weekday(d)) || 0) + 1));
  return [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([d, n]) => (n > 1 ? `${d} ×${n}` : d)).join(', ');
}

function line(s: Session): string {
  const bits = [`${s.date} (${weekday(s.date).slice(0, 3)}) ${s.name} [${s.type}${s.plannedMin ? `, ${s.plannedMin} min planned` : ''}]`];
  if (!s.done) bits.push('NOT DONE');
  else {
    if (s.rideMin != null) bits.push(`rode ${s.rideMin} min`);
    if (s.rideIF != null) bits.push(`IF ${s.rideIF.toFixed(2)}`);
    if (s.rpe != null) bits.push(`RPE ${s.rpe}/5`);
    if (s.notes?.trim()) bits.push(`notes: "${s.notes.trim().slice(0, 160)}"`);
  }
  return '- ' + bits.join(' · ');
}

function isStruggle(s: Session): boolean {
  if (!s.done || s.special) return false;
  if (s.rpe != null && s.rpe >= 5) return true;
  if (s.rpe != null && s.rpe >= 4 && EASY_TYPES.has(s.type)) return true;
  if (s.notes && STRUGGLE_RE.test(s.notes)) return true;
  return false;
}

function isCutShort(s: Session): boolean {
  return s.done && !s.special && s.plannedMin != null && s.plannedMin >= 45 && s.rideMin != null && s.rideMin < 0.75 * s.plannedMin;
}

function isEasyDayRiddenHard(s: Session): boolean {
  if (!s.done || s.special || s.rideIF == null || !EASY_TYPES.has(s.type)) return false;
  return s.type === 'recovery' ? s.rideIF >= 0.7 : s.rideIF >= 0.82;
}

/**
 * Pure: every pattern present in the facts, highest priority first.
 * Thresholds favour missing a borderline case over nagging about noise.
 */
export function detectCheckIns(f: CheckInFacts): CheckIn[] {
  const out: CheckIn[] = [];
  const last = (days: number) => f.sessions.filter((s) => daysBetween(s.date, f.today) <= days);

  // Race week: 5–8 days out — taper, openers, fueling, pacing, logistics.
  // Race debrief: 1–3 days after — how it went and what's next.
  for (const e of f.events || []) {
    const until = daysBetween(f.today, e.date);
    if (until >= 5 && until <= 8) {
      out.push({ kind: 'race_week', evidence: [e.date], summary: [`TARGET EVENT: "${e.name}" on ${e.date} (${weekday(e.date)}) — ${until} days away.`] });
    }
    if (until <= -1 && until >= -3 && !e.ride?.debriefed) {
      const r = e.ride;
      out.push({
        kind: 'race_debrief',
        evidence: [e.date],
        summary: [
          `TARGET EVENT: "${e.name}" was ${-until} day${until === -1 ? '' : 's'} ago (${e.date}).`,
          r ? `Event-day ride: ${r.minutes ?? '?'} min${r.IF != null ? `, IF ${r.IF.toFixed(2)}` : ''}${r.rpe != null ? `, RPE ${r.rpe}/5` : ''}${r.notes ? `, notes: "${r.notes.slice(0, 200)}"` : ''}.` : 'No ride synced for the event day (may not have raced, or not uploaded yet).',
        ],
      });
    }
  }
  const recent14 = last(14);
  const missed14 = recent14.filter((s) => !s.done && !s.special);
  const missed7 = last(7).filter((s) => !s.done && !s.special);

  // Gone quiet: no riding for 6+ days while the plan keeps going. Could be
  // illness, injury, travel or life — a coach checks in on the person first.
  if (f.daysSinceLastRide != null && f.daysSinceLastRide >= 6 && missed7.length >= 2) {
    out.push({
      kind: 'gone_quiet',
      evidence: missed7.map((s) => s.date),
      summary: [`No rides in ${f.daysSinceLastRide} days; ${missed7.length} planned sessions missed this week:`, ...missed7.map(line)],
    });
  }

  // Too hard: struggling repeatedly (max RPE, easy rides that felt hard, or notes
  // like "couldn't finish"). Ask whether to back off before they dig a hole.
  const judged = f.sessions.filter((s) => s.done && !s.special && (s.rpe != null || s.notes?.trim())).slice(0, 6);
  const struggles = judged.filter(isStruggle);
  if (struggles.length >= 3) {
    out.push({
      kind: 'too_hard',
      evidence: struggles.map((s) => s.date),
      summary: [`${struggles.length} of the last ${judged.length} rated workouts were a struggle:`, ...struggles.map(line)],
    });
  }

  // Recovery slump: 3 of the last 4 mornings poor (WHOOP red, <6h sleep, or
  // feeling exhausted/tired with poor sleep). The daily suggestion adapts each
  // day; a coach also asks what's behind a STREAK — stress, illness, life.
  const well = (f.wellness || []).filter((w) => daysBetween(w.date, f.today) <= 3);
  const poor = well.filter((w) =>
    (w.readiness != null && w.readiness < 34) ||
    (w.sleepHours != null && w.sleepHours < 6) ||
    ((w.feeling === 'exhausted' || w.feeling === 'tired') && (w.sleepQuality === 'terrible' || w.sleepQuality === 'poor')));
  if (well.length >= 3 && poor.length >= 3) {
    out.push({
      kind: 'recovery_slump',
      evidence: poor.map((w) => w.date),
      summary: [
        `${poor.length} of the last ${well.length} mornings showed poor recovery:`,
        ...poor.map((w) => `- ${w.date}: ${[w.readiness != null ? `recovery ${w.readiness}%` : '', w.sleepHours != null ? `${w.sleepHours.toFixed(1)}h sleep` : '', w.sleepQuality ? `sleep ${w.sleepQuality}` : '', w.feeling ? `feeling ${w.feeling}` : ''].filter(Boolean).join(', ')}`),
      ],
    });
  }

  // Missed workouts: 3+ in two weeks and at least 30% of the plan. Find out WHY
  // (time, fatigue, motivation, the day itself) — the fix depends on the reason.
  const planned14 = recent14.filter((s) => !s.special).length;
  if (!out.some((c) => c.kind === 'gone_quiet') && missed14.length >= 3 && missed14.length / Math.max(planned14, 1) >= 0.3) {
    const types = [...new Set(missed14.map((s) => s.type))].join(', ');
    out.push({
      kind: 'missed_workouts',
      evidence: missed14.map((s) => s.date),
      summary: [
        `Missed ${missed14.length} of ${planned14} planned sessions in the last 2 weeks. Days: ${dayPattern(missed14.map((s) => s.date))}. Types: ${types}.`,
        ...missed14.map(line),
      ],
    });
  }

  // Fatigue creep: the same kind of work keeps feeling harder (RPE up ≥1 over the
  // last 3 quality sessions vs the 3 before) while output hasn't risen. Early
  // sign of accumulated fatigue or burnout — before it shows up as 5/5 days.
  const qRated = f.sessions.filter((s) => s.done && !s.special && s.rpe != null && !EASY_TYPES.has(s.type)).slice(0, 6);
  if (qRated.length === 6) {
    const avg = (xs: Session[], k: 'rpe' | 'rideIF') => {
      const v = xs.map((x) => x[k]).filter((n): n is number => n != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    const [newer, older] = [qRated.slice(0, 3), qRated.slice(3)];
    const rNew = avg(newer, 'rpe') as number, rOld = avg(older, 'rpe') as number;
    const iNew = avg(newer, 'rideIF'), iOld = avg(older, 'rideIF');
    if (rNew - rOld >= 1 && (iNew == null || iOld == null || iNew <= iOld + 0.02) && !out.some((c) => c.kind === 'too_hard')) {
      out.push({
        kind: 'fatigue_creep',
        evidence: newer.map((s) => s.date),
        summary: [
          `Quality sessions are feeling harder for the same output: avg RPE ${rOld.toFixed(1)} → ${rNew.toFixed(1)}/5${iNew != null && iOld != null ? `, avg IF ${iOld.toFixed(2)} → ${iNew.toFixed(2)}` : ''}.`,
          ...qRated.map(line),
        ],
      });
    }
  }

  // Cut short: rides keep ending well before the planned duration — the plan
  // asks for more time than they really have on those days.
  const doneRecent = f.sessions.filter((s) => s.done && !s.special).slice(0, 10);
  const short = doneRecent.filter(isCutShort);
  if (short.length >= 3) {
    out.push({
      kind: 'cut_short',
      evidence: short.map((s) => s.date),
      summary: [`${short.length} of the last ${doneRecent.length} workouts ended under 75% of the planned time. Days: ${dayPattern(short.map((s) => s.date))}.`, ...short.map(line)],
    });
  }

  // Too easy: quality sessions (not endurance — Z2 SHOULD feel easy) keep being
  // rated 1–2/5. Usually FTP is set low, so every target is low.
  const quality = f.sessions.filter((s) => s.done && !s.special && s.rpe != null && !EASY_TYPES.has(s.type)).slice(0, 6);
  const easy = quality.filter((s) => (s.rpe as number) <= 2 && !isCutShort(s));
  if (!struggles.length && quality.length >= 3 && easy.length >= 3 && easy.length / quality.length >= 2 / 3) {
    const suggestion: CheckIn['suggestion'] =
      f.daysSinceFtpTest == null || f.daysSinceFtpTest > 42 ? 'ftp_test'
        : f.experienceLevel !== 'advanced' ? 'level_up'
          : 'harder_block';
    out.push({
      kind: 'too_easy',
      evidence: easy.map((s) => s.date),
      suggestion,
      summary: [
        `${easy.length} of the last ${quality.length} quality workouts were rated 1–2/5 (easy).`,
        `FTP ${f.ftp ?? 'unknown'}W, last FTP test: ${f.daysSinceFtpTest == null ? 'none on record' : `${f.daysSinceFtpTest} days ago`}. Experience level: ${f.experienceLevel || 'not set'}.`,
        ...easy.map(line),
      ],
    });
  }

  // Easy days ridden hard: endurance/recovery days ridden at tempo or harder.
  // The classic grey-zone trap — tired for the key sessions, no extra fitness.
  const easyDays = f.sessions.filter((s) => s.done && !s.special && EASY_TYPES.has(s.type) && s.rideIF != null).slice(0, 8);
  const hot = easyDays.filter(isEasyDayRiddenHard);
  if (hot.length >= 3) {
    out.push({
      kind: 'easy_days_too_hard',
      evidence: hot.map((s) => s.date),
      summary: [`${hot.length} of the last ${easyDays.length} easy days were ridden hard (endurance IF ≥ 0.82, recovery ≥ 0.70):`, ...hot.map(line)],
    });
  }

  // Goal check: every ~5 weeks into an active plan — is the goal still right,
  // too ambitious, not ambitious enough? (Cooldown makes it periodic.)
  if (f.plan && daysBetween(f.plan.startDate, f.today) >= 35 && (!f.plan.eventDate || daysBetween(f.today, f.plan.eventDate) >= 21)) {
    const planned = last(35).filter((s) => !s.special);
    const done = planned.filter((s) => s.done);
    const qr = done.filter((s) => !EASY_TYPES.has(s.type) && s.rpe != null);
    out.push({
      kind: 'goal_check',
      evidence: [f.today],
      summary: [
        `PLAN: "${f.plan.goal}", started ${f.plan.startDate}${f.plan.eventDate ? `, event ${f.plan.eventDate} (${Math.round(daysBetween(f.today, f.plan.eventDate) / 7)} weeks away)` : ''}.`,
        `Last 5 weeks: ${done.length} of ${planned.length} planned sessions done${qr.length ? `, quality RPE avg ${(qr.reduce((a, s) => a + (s.rpe as number), 0) / qr.length).toFixed(1)}/5` : ''}.`,
        f.ctlNow != null && f.ctl5wAgo != null ? `Fitness (CTL) ${Math.round(f.ctl5wAgo)} → ${Math.round(f.ctlNow)} over 5 weeks.` : 'Fitness trend unavailable.',
        `FTP ${f.ftp ?? 'unknown'}W, last test ${f.daysSinceFtpTest == null ? 'none on record' : `${f.daysSinceFtpTest} days ago`}.`,
      ],
    });
  }

  // Great block: 8+ planned sessions in 3 weeks, 90%+ done, nothing missed in the
  // last 2 weeks and nothing else to raise. Coaches notice the good stuff too.
  const planned21 = last(21).filter((s) => !s.special);
  const done21 = planned21.filter((s) => s.done);
  if (!out.some((c) => c.kind !== 'goal_check') && planned21.length >= 8 && done21.length / planned21.length >= 0.9 && !missed14.length) {
    out.push({
      kind: 'great_block',
      evidence: done21.map((s) => s.date),
      summary: [`Completed ${done21.length} of ${planned21.length} planned sessions in the last 3 weeks, none missed in the last 2.`],
    });
  }

  return PRIORITY.flatMap((k) => out.filter((c) => c.kind === k));
}

export interface SentCheckIn { kind: string; created_at: string }

/** Pure: the one check-in to send today, if any, given what was already sent. */
export function pickCheckIn(found: CheckIn[], sent: SentCheckIn[], today: string): CheckIn | null {
  const lastAny = sent.reduce<string | null>((m, s) => (!m || s.created_at > m ? s.created_at : m), null);
  if (lastAny && daysBetween(lastAny.slice(0, 10), today) < MIN_DAYS_BETWEEN) return null;
  for (const c of found) {
    const prev = sent.filter((s) => s.kind === c.kind).map((s) => s.created_at).sort().pop();
    if (prev) {
      if (daysBetween(prev.slice(0, 10), today) < COOLDOWN_DAYS[c.kind]) continue;
      // Same evidence as last time → already raised; wait for something new.
      if (!c.evidence.some((d) => d > prev.slice(0, 10))) continue;
    }
    return c;
  }
  return null;
}

const ASK: Record<CheckInKind, string> = {
  race_week:
    `Their target event is a week out. Prep them like a coach would: check the calendar for a proper taper (volume down, a little intensity kept, short openers the day or two before) and offer to fix it if it isn't there; give a concrete fueling plan (carbs per hour for the expected duration, what to eat the day before and morning of); pacing guidance in watts from their FTP and anything you know about the course. Ask ONE question that sharpens the plan (course, start time, or what they're most worried about).`,
  race_debrief:
    `Their target event just happened. Ask how it went — result AND how it felt — and react to the ride data if it synced. Then look forward briefly: the next few days should be easy/rest, and ask what's next (another event, a new goal, or an off-season break) so you can set up the next block.`,
  gone_quiet:
    `They haven't ridden in days while the plan kept going. Check on THEM first — sick, injured, travelling, work/life? Don't guilt them. Say you'll adjust the plan around whatever is going on (pause it, push it back, or ease back in), and ask what happened.`,
  too_hard:
    `The workouts are landing too hard. Ask directly whether you should back off. Name the likely cause from the data (FTP set too high? too many hard days stacked? poor sleep/recovery? life stress?) and propose ONE concrete change (e.g. lower FTP ~3–5%, swap the next hard session for endurance, add a recovery day this week) — offer it, don't apply it.`,
  missed_workouts:
    `Workouts are being missed. Ask WHY before fixing anything — the fix depends on the reason: not enough time that day (→ reshape their daily availability), too tired (→ less load), motivation/boredom (→ more variety or outdoor), or the day itself never works (→ move that session). If the missed days/types show a pattern, name it ("Thursdays keep slipping"). Offer one concrete change for the likely reason.`,
  cut_short:
    `Rides keep ending well before the planned time — the plan asks for more time than they really have on those days. Point out the pattern and ask how much time they actually have on those days. Offer to save the real numbers (update_athlete_preferences daily_training_hours) and fit future workouts to them, keeping the key work and trimming the filler.`,
  too_easy:
    `Their quality workouts keep feeling easy. That's good news — they've likely outgrown the plan's targets. Before assuming, glance at the ride data: if they hit the targets and it still felt easy, the targets are too low. Lead with the single suggestion below and ask if they want it.`,
  easy_days_too_hard:
    `Their easy days are being ridden hard (tempo or harder). Explain in one or two sentences why that hurts: tired for the sessions that matter, little extra fitness. Ask what's happening — group rides, Zwift races, just feeling good, or the easy pace feels too slow? If it's a regular group ride or race, offer to build the week around it as a fixed session instead of fighting it.`,
  recovery_slump:
    `Their recovery has been poor several mornings running. The daily plan already eases off day by day — your job is to ask what's behind the streak (work/life stress, getting sick, travel, poor sleep habits, under-eating, alcohol) without lecturing. Offer to make the next 2–3 days easy or rest, and ONE concrete sleep/recovery tip if relevant.`,
  fatigue_creep:
    `The same work is feeling harder while output hasn't gone up — early fatigue or burnout, before it becomes a bad day. Point to the trend specifically. Ask how they're feeling about training: tired, stressed, bored, or unmotivated? Offer a down week (or a few easy days) now, and if it's boredom, more variety or riding outside.`,
  goal_check:
    `Periodic goal check, ~5 weeks into the plan. Give an honest read on whether they're on track for the goal using the numbers (completion, fitness trend, effort). Then ask whether the goal is still right: still the target, too ambitious, or not ambitious enough? If the data says to adjust (e.g. great progress → more ambitious target; lots missed → rethink the date or goal), say so plainly.`,
  great_block:
    `They've been very consistent. Say so specifically (what they've done and what it's building), briefly. Then one forward-looking line: what's next in the plan or a question about how the body feels. No generic hype.`,
};

const SUGGESTION_TEXT: Record<NonNullable<CheckIn['suggestion']>, string> = {
  ftp_test: `SUGGESTION: their FTP hasn't been tested recently — offer to schedule an FTP test (pick a sensible day from their calendar) so every zone moves up. Or, if they'd rather not test, offer to raise FTP ~3–5% via update_athlete_ftp.`,
  level_up: `SUGGESTION: FTP was tested recently, so offer to move their experience level up one step (update_athlete_preferences experience_level) — more quality sessions and reps — and rebuild the plan from next week.`,
  harder_block: `SUGGESTION: FTP is recent and they're already advanced — offer to make the next block harder (extend reps / time-in-zone) and check whether their goal could be more ambitious.`,
};

const PUSH_TITLE: Record<CheckInKind, string> = {
  race_week: 'Race week is coming',
  race_debrief: 'How did the race go?',
  recovery_slump: 'Checking in on your recovery',
  fatigue_creep: 'How are you feeling about training?',
  goal_check: 'Checking in on your goal',
  gone_quiet: 'Checking in',
  too_hard: 'Should we back off?',
  missed_workouts: 'Quick check-in on your plan',
  cut_short: 'Let\'s fit the plan to your time',
  too_easy: 'Ready for more?',
  easy_days_too_hard: 'About your easy days',
  great_block: 'Great block of training',
};

/** Pure: the instruction handed to the coach. */
export function buildCheckInPrompt(c: CheckIn): string {
  const lines = [
    `[COACH-INITIATED CHECK-IN] The athlete did NOT send a message. You noticed a pattern in their training and are reaching out first.`,
    ``,
    `WHAT YOU NOTICED:`,
    ...c.summary,
    ``,
    `WHAT TO DO: ${ASK[c.kind]}`,
  ];
  if (c.suggestion) lines.push(SUGGESTION_TEXT[c.suggestion]);
  lines.push(
    ``,
    `Rules:`,
    `- Sound like a coach who's been watching, not an automated alert. Reference the specific sessions/days.`,
    `- Ask before changing anything: OFFER the change, never claim it's done.`,
    `- End with ONE clear question.`,
    `- Short: up to 5 sentences even in simple display mode. No greeting fluff, no headers, no bullet lists.`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------- data loading

export async function loadFacts(athlete: any): Promise<CheckInFacts> {
  const tz = athlete.timezone || 'America/Los_Angeles';
  const today = todayInTimezone(tz);
  const from = new Date(Date.parse(today + 'T12:00:00Z') - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const weekAgo = new Date(Date.parse(today + 'T12:00:00Z') - 7 * 86_400_000).toISOString().slice(0, 10);
  const fiveWeeksAgo = new Date(Date.parse(today + 'T12:00:00Z') - 35 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: entries }, { data: rides }, { data: lastRide }, { data: tests }, { data: wellnessRows }, { data: plans }, { data: ctlRows }] = await Promise.all([
    supabaseAdmin
      .from('calendar_entries')
      .select('scheduled_date, completed, strava_activity_id, entry_type, notes, workouts(name, workout_type, duration_minutes, intervals)')
      .eq('athlete_id', athlete.id)
      .gte('scheduled_date', from)
      .lt('scheduled_date', today)
      .order('scheduled_date', { ascending: false }),
    supabaseAdmin
      .from('strava_activities')
      .select('strava_activity_id, start_date, moving_time_seconds, tss, perceived_effort, post_activity_notes, coach_debrief_at')
      .eq('athlete_id', athlete.id)
      .gte('start_date', from + 'T00:00:00Z'),
    supabaseAdmin
      .from('strava_activities')
      .select('start_date')
      .eq('athlete_id', athlete.id)
      .order('start_date', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('calendar_entries')
      .select('scheduled_date')
      .eq('athlete_id', athlete.id)
      .like('notes', `${FTP_TEST_NOTE_PREFIX}%`)
      .order('scheduled_date', { ascending: false })
      .limit(1),
    supabaseAdmin
      .from('daily_metrics')
      .select('date, readiness_score, sleep_seconds, sleep_quality, feeling')
      .eq('athlete_id', athlete.id)
      .gte('date', weekAgo)
      .lte('date', today)
      .order('date', { ascending: false }),
    supabaseAdmin
      .from('training_plans')
      .select('goal_event, event_date, start_date')
      .eq('athlete_id', athlete.id)
      .eq('status', 'active')
      .order('start_date', { ascending: true }),
    supabaseAdmin
      .from('athlete_metrics')
      .select('date, ctl')
      .eq('athlete_id', athlete.id)
      .gte('date', fiveWeeksAgo)
      .order('date', { ascending: true }),
  ]);

  const rideList = (rides || []).map((r: any) => ({ ...r, localDate: utcToLocalDate(r.start_date, tz) }));
  const sessions: Session[] = [];
  for (const e of (entries || []) as any[]) {
    const w = e.workouts;
    if (!w || (e.entry_type && e.entry_type !== 'workout')) continue;
    const ride =
      (e.strava_activity_id && rideList.find((r) => String(r.strava_activity_id) === String(e.strava_activity_id))) ||
      rideList.find((r) => r.localDate === e.scheduled_date) ||
      null;
    const hours = ride?.moving_time_seconds ? ride.moving_time_seconds / 3600 : null;
    sessions.push({
      date: e.scheduled_date,
      name: w.name,
      type: w.workout_type,
      plannedMin: w.duration_minutes ?? null,
      special: isFtpTestWorkout(w) || isFixedSession(w),
      done: !!e.completed || !!ride,
      rideMin: hours ? Math.round(hours * 60) : null,
      rideIF: hours && ride?.tss ? Math.sqrt(ride.tss / (hours * 100)) : null,
      rpe: ride?.perceived_effort ?? null,
      notes: ride?.post_activity_notes ?? null,
    });
  }

  const rideFacts = (r: any) => {
    const h = r.moving_time_seconds ? r.moving_time_seconds / 3600 : null;
    return {
      minutes: h ? Math.round(h * 60) : null,
      IF: h && r.tss ? Math.sqrt(r.tss / (h * 100)) : null,
      rpe: r.perceived_effort ?? null,
      notes: r.post_activity_notes ?? null,
      debriefed: !!r.coach_debrief_at,
    };
  };

  // Target events: active plans' event dates, plus a saved goal date. Dedup by date.
  const events = new Map<string, EventInfo>();
  for (const p of (plans || []) as any[]) {
    if (p.event_date) events.set(p.event_date, { name: p.goal_event || 'Target event', date: p.event_date });
  }
  const prefs = athlete.preferences || {};
  if (typeof prefs.event_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(prefs.event_date) && !events.has(prefs.event_date)) {
    events.set(prefs.event_date, { name: prefs.training_goal || 'Target event', date: prefs.event_date });
  }
  for (const e of events.values()) {
    // Biggest ride that day = the event.
    const r = rideList.filter((x) => x.localDate === e.date).sort((a, b) => (b.moving_time_seconds || 0) - (a.moving_time_seconds || 0))[0];
    e.ride = r ? rideFacts(r) : null;
  }

  const plan = (plans || [])[0] as any;
  const lastRideDate = lastRide?.[0]?.start_date ? utcToLocalDate(lastRide[0].start_date, tz) : null;
  const lastTest = tests?.[0]?.scheduled_date || null;
  return {
    today,
    sessions,
    daysSinceLastRide: lastRideDate ? daysBetween(lastRideDate, today) : null,
    daysSinceFtpTest: lastTest ? daysBetween(lastTest, today) : null,
    experienceLevel: athlete.experience_level ?? null,
    ftp: athlete.ftp ?? null,
    wellness: ((wellnessRows || []) as any[]).map((w) => ({
      date: w.date,
      readiness: w.readiness_score ?? null,
      sleepHours: w.sleep_seconds ? w.sleep_seconds / 3600 : null,
      sleepQuality: w.sleep_quality ?? null,
      feeling: w.feeling ?? null,
    })),
    events: [...events.values()],
    plan: plan ? { goal: plan.goal_event || 'Training plan', startDate: plan.start_date, eventDate: plan.event_date || null } : null,
    ctlNow: ctlRows?.length ? (ctlRows[ctlRows.length - 1] as any).ctl : null,
    ctl5wAgo: ctlRows?.length ? (ctlRows[0] as any).ctl : null,
  };
}

/** Pure: compact "how is the plan landing" lines for the plan designer. */
export function summarizeForPlanning(f: CheckInFacts): string | null {
  const planned = f.sessions.filter((s) => !s.special && daysBetween(s.date, f.today) <= 21);
  if (planned.length < 4) return null;
  const done = planned.filter((s) => s.done);
  const quality = done.filter((s) => !EASY_TYPES.has(s.type) && s.rpe != null);
  const avgQ = quality.length ? quality.reduce((a, s) => a + (s.rpe as number), 0) / quality.length : null;
  const lines = [`- Completed ${done.length} of ${planned.length} planned workouts in the last 21 days.`];
  const missed = planned.filter((s) => !s.done);
  if (missed.length) lines.push(`- Missed days: ${dayPattern(missed.map((s) => s.date))}.`);
  if (avgQ != null) lines.push(`- Quality sessions averaged RPE ${avgQ.toFixed(1)}/5 over ${quality.length} rated (≤2 = too easy, 5 = too hard).`);
  const short = done.filter(isCutShort);
  if (short.length) lines.push(`- ${short.length} rides cut under 75% of planned time (days: ${dayPattern(short.map((s) => s.date))}) — real time on those days is less than stated.`);
  const hot = done.filter(isEasyDayRiddenHard);
  if (hot.length) lines.push(`- ${hot.length} easy days ridden at tempo or harder.`);
  return lines.join('\n');
}

export async function recentPlanFeedback(athleteId: string): Promise<string | null> {
  const { data: athlete } = await supabaseAdmin
    .from('athletes').select('id, timezone, experience_level, ftp, preferences').eq('id', athleteId).single();
  if (!athlete) return null;
  return summarizeForPlanning(await loadFacts(athlete));
}

// ---------------------------------------------------------------- sending

async function latestConversationId(athleteId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('chat_conversations')
    .select('id')
    .eq('athlete_id', athleteId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);
  if (data?.[0]?.id) return data[0].id;
  const { data: created, error } = await supabaseAdmin
    .from('chat_conversations')
    .insert({ athlete_id: athleteId, title: 'Coach check-in', last_message_at: new Date().toISOString() })
    .select('id')
    .single();
  if (error || !created) throw new Error(`Could not create conversation: ${error?.message}`);
  return created.id;
}

export const coachCheckInService = {
  /** Returns what happened, for logs/tests. */
  async checkAthlete(athlete: any): Promise<string> {
    const facts = await loadFacts(athlete);
    const found = detectCheckIns(facts);
    if (!found.length) return 'nothing';

    const { data: sent, error: sentErr } = await supabaseAdmin
      .from('coach_checkins')
      .select('kind, created_at')
      .eq('athlete_id', athlete.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (sentErr) {
      logger.error('[CheckIn] Could not read history (is migration 044 applied?):', sentErr.message);
      return 'history_failed';
    }
    const pick = pickCheckIn(found, sent || [], facts.today);
    if (!pick) return 'cooldown';

    // Don't talk over a live conversation or a fresh ride debrief.
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { data: recentMsgs } = await supabaseAdmin
      .from('chat_messages')
      .select('id')
      .eq('athlete_id', athlete.id)
      .gte('created_at', since)
      .limit(1);
    if (recentMsgs?.length) return 'recent_chat';

    // Record first: a failure below must never turn into a daily retry loop.
    const { error: insErr } = await supabaseAdmin
      .from('coach_checkins')
      .insert({ athlete_id: athlete.id, kind: pick.kind, facts: { evidence: pick.evidence, suggestion: pick.suggestion ?? null } });
    if (insErr) {
      logger.error('[CheckIn] Could not record check-in:', insErr.message);
      return 'record_failed';
    }

    // Lazy import: aiCoachService pulls in a large dependency graph.
    const { aiCoachService } = await import('./aiCoachService');
    const context = await aiCoachService.buildAthleteContext(athlete.id);
    const system = aiCoachService.buildSystemPrompt(context);
    const convId = await latestConversationId(athlete.id);

    const { data: history } = await supabaseAdmin
      .from('chat_messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(6);
    const turns = (history || []).reverse()
      .map((m: any) => `${m.role === 'user' ? 'ATHLETE' : 'COACH'}: ${String(m.content).slice(0, 600)}`)
      .join('\n');

    const response = await anthropic.messages.create({
      model: SONNET,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: (turns ? `RECENT CHAT (for continuity):\n${turns}\n\n` : '') + buildCheckInPrompt(pick) }],
    });
    const text = response.content.find((c: any) => c.type === 'text') as any;
    const content: string = text?.text?.trim();
    if (!content) return 'empty_response';

    await supabaseAdmin.from('chat_messages').insert({
      conversation_id: convId,
      athlete_id: athlete.id,
      role: 'assistant',
      content,
    });
    await supabaseAdmin.from('chat_conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId);

    if (athlete.push_token && athlete.push_notifications_enabled) {
      const body = content.length > 140 ? `${content.slice(0, 137)}…` : content;
      await sendPushNotification(athlete.push_token, PUSH_TITLE[pick.kind], body, { screen: 'Chat', type: 'coach_checkin' })
        .catch((err) => logger.warn('[CheckIn] Push failed:', err));
    }

    logger.info(`[CheckIn] Coach reached out to ${athlete.id}: ${pick.kind}${pick.suggestion ? ` (${pick.suggestion})` : ''}`);
    return `sent:${pick.kind}`;
  },
};

function localHour(tz: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

/** Hourly; each athlete is checked in the hour their local clock reads CHECKIN_HOUR. */
export function startCoachCheckInCron() {
  let running = false;
  cron.schedule('5 * * * *', async () => {
    if (running) return;
    running = true;
    try {
      // Only athletes with something on the calendar recently have a plan to watch.
      const from = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const { data: rows } = await supabaseAdmin
        .from('calendar_entries')
        .select('athlete_id')
        .gte('scheduled_date', from)
        .limit(5000);
      const ids = [...new Set((rows || []).map((r: any) => r.athlete_id))];
      if (!ids.length) return;
      const { data: athletes } = await supabaseAdmin
        .from('athletes')
        .select('id, timezone, experience_level, ftp, preferences, push_token, push_notifications_enabled')
        .in('id', ids);
      for (const a of athletes || []) {
        if (localHour(a.timezone || 'America/Los_Angeles') !== CHECKIN_HOUR) continue;
        try {
          const result = await coachCheckInService.checkAthlete(a);
          if (result !== 'nothing') logger.info(`[CheckIn] ${a.id}: ${result}`);
        } catch (err) {
          logger.error(`[CheckIn] Failed for ${a.id}:`, err);
        }
      }
    } catch (err) {
      logger.error('[CheckIn] Cron error:', err);
    } finally {
      running = false;
    }
  });
  logger.info(`[CheckIn] Coach check-in cron started (daily at ${CHECKIN_HOUR}:05 local)`);
}
