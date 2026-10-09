/**
 * The coach's LIVE STATE snapshot — prepended to the athlete's newest message
 * on every chat turn.
 *
 * Why: the coach answered "you already have this plan, I built it Oct 4" four
 * seconds after the athlete deleted every plan. The system prompt DID say
 * "ACTIVE TRAINING PLANS: None", but that was one line in a very long prompt,
 * followed by 50 messages of chat history in which the coach confidently
 * described the plan it built. An empty calendar produced no text at all. The
 * model trusted its own past messages over a quiet line of truth.
 *
 * So the current truth goes where the model weighs it most — right next to the
 * athlete's words — with explicit NONE/EMPTY states, what changed since the
 * coach last spoke, and the rule that this snapshot beats chat history.
 * Pure + exported for tests; data is gathered in aiCoachService.
 */

export interface LiveStateInput {
  nowLabel: string; // e.g. "Wednesday, October 8, 2026"
  todayIso: string;
  activePlans: { goal_event: string; start_date?: string; event_date?: string | null; end_date?: string | null }[];
  /** Future calendar entries (incl. today), chronological. */
  upcoming: { scheduled_date: string; entry_type?: string | null; completed?: boolean | null; workouts?: { name?: string; duration_minutes?: number } | null }[];
  load?: { ctl?: number; atl?: number; tsb?: number; status?: string } | null;
  ridesToday: { name: string; moving_time_seconds?: number | null; tss?: number | null }[];
  checkIn?: string | null; // short readiness summary, if any
  /** Wearable recovery line (WHOOP) — already formatted, starts with "- ". */
  wearable?: string | null;
  /** Non-cycling sessions today/yesterday, already described. */
  otherTraining?: string[];
  lastCoachReplyAt?: string | null;
  changes: string[]; // human-readable changes since lastCoachReplyAt
}

export function formatLiveState(s: LiveStateInput): string {
  const lines: string[] = [];
  lines.push(`[LIVE STATE — read from the database at the moment of this message (${s.nowLabel}). This is the CURRENT TRUTH. If anything earlier in this conversation — including your own past messages — disagrees, THIS wins: the athlete can change plans and the calendar in the app at any time. Never say a plan or workout exists unless it is listed here; if unsure, call get_calendar before answering.]`);

  // Plans
  if (!s.activePlans.length) {
    lines.push('- Active training plans: NONE.');
  } else {
    lines.push(`- Active training plans (${s.activePlans.length}): ` + s.activePlans
      .map((p) => `"${p.goal_event}" (${p.start_date ?? '?'} → ${p.end_date ?? p.event_date ?? '?'})`).join('; ') + '.');
    lines.push('  ↳ If the athlete asks for a NEW plan: tell them about the active plan above FIRST and ask whether to replace it or keep both — before gathering details or building.');
  }

  // Calendar
  const workouts = s.upcoming.filter((e) => (e.entry_type ?? 'workout') !== 'rest' && e.workouts);
  const rest = s.upcoming.length - workouts.length;
  if (!workouts.length) {
    lines.push(`- Calendar from today: EMPTY — no workouts scheduled${rest ? ` (only ${rest} rest-day marker${rest === 1 ? '' : 's'})` : ''}.`);
  } else {
    const today = workouts.filter((e) => e.scheduled_date === s.todayIso);
    const next = workouts.filter((e) => e.scheduled_date !== s.todayIso).slice(0, 3);
    const fmt = (e: LiveStateInput['upcoming'][number]) =>
      `${e.scheduled_date} ${e.workouts?.name ?? 'workout'}${e.workouts?.duration_minutes ? ` (${e.workouts.duration_minutes}min)` : ''}${e.completed ? ' ✓done' : ''}`;
    lines.push(`- Today's scheduled workout: ${today.length ? today.map(fmt).join('; ') : 'none'}.`);
    lines.push(`- Next up: ${next.length ? next.map(fmt).join('; ') : 'nothing else scheduled'} (${workouts.length} workouts on the calendar in the window).`);
  }

  // Load / freshness
  if (s.load && s.load.ctl != null) {
    lines.push(`- Load: fitness CTL ${Math.round(s.load.ctl)}, fatigue ATL ${Math.round(s.load.atl ?? 0)}, form TSB ${Math.round(s.load.tsb ?? 0)}${s.load.status ? ` (${s.load.status})` : ''}.`);
  }

  // Today
  lines.push(`- Ridden today: ${s.ridesToday.length
    ? s.ridesToday.map((r) => `"${r.name}"${r.moving_time_seconds ? ` ${Math.round(r.moving_time_seconds / 60)}min` : ''}${r.tss ? ` TSS ${Math.round(r.tss)}` : ''}`).join('; ')
    : 'nothing yet'}.`);
  if (s.checkIn) lines.push(`- Today's check-in: ${s.checkIn}.`);
  if (s.otherTraining?.length) lines.push(`- Other training (non-cycling): ${s.otherTraining.join('; ')}.`);
  if (s.wearable) lines.push(s.wearable);

  // What changed while the coach wasn't looking
  if (s.changes.length) {
    lines.push(`- CHANGED since your last reply${s.lastCoachReplyAt ? ` (${s.lastCoachReplyAt})` : ''}: ${s.changes.join('; ')}. Acknowledge this — do not describe the old state as current.`);
  }

  lines.push('[End live state. The athlete\'s message follows.]');
  return lines.join('\n');
}
