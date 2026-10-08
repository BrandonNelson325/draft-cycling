/**
 * State-claim guard: a CODE check on the coach's finished reply.
 *
 * The live-state snapshot puts the truth in front of the model, but a model can
 * still assert something from memory. For the claims that matter most — does a
 * plan exist, is a workout scheduled, did they ride today — we don't rely on
 * the model noticing: we compare the reply against the database and force a
 * rewrite on contradiction.
 *
 * Deliberately narrow, affirmative patterns (false positives only cost one
 * extra model call; false negatives are what the live state + awareness eval
 * cover). Pure + exported for tests.
 */

export interface StateFacts {
  activePlans: number;
  upcomingWorkouts: number; // workouts (not rest markers) from today on
  workoutToday: boolean;
  rodeToday: boolean;
}

export interface GuardOptions {
  /** A plan build / bulk schedule was queued this turn (runs in the background,
   *  so "your plan is being built" is true while the DB doesn't show it yet). */
  stateChangePending?: boolean;
}

const CLAIMS = {
  planExists: [
    /\byou(?:'ve| have)? already (?:have|got) (?:this|that|a|the|your)\b[^.?!]{0,40}\bplan\b/i,
    /\b(?:I|we) (?:already )?(?:set|built|created) (?:it|this|that|this plan|that plan|your plan|the plan)(?: up)? for you\b/i,
    /\b(?:your|the|this) plan is (?:already )?(?:built|running|active|live|in place|set up)\b/i,
    /\byou(?:'re| are) (?:already )?(?:on|following|in) (?:a|the|your|this) (?:\w+[ -]){0,4}plan\b/i,
  ],
  workoutScheduled: [
    /\b(?:is|are|'s) (?:already |still )?on your calendar\b/i,
    /\byou have (?:a |an |your )?[\w -]{0,40}\b(?:scheduled|planned|on the calendar) (?:for )?(?:today|tomorrow|this week)\b/i,
    /\b(?:calendar|schedule) (?:should )?(?:include|includes|shows|has) (?:today|tomorrow)'?s?\b/i,
    /\b(?:today|tomorrow)'s (?:scheduled|planned) [\w -]{0,30}\b(?:session|workout|ride)\b/i,
  ],
  workoutToday: [
    /\btoday'?s (?:planned |scheduled )?(?:vo2|vo2max|threshold|sweet spot|tempo|endurance|sprint|interval|recovery|anaerobic)[\w -]{0,20}\b(?:session|workout|intervals?)\b/i,
    /\byou(?:'ve| have) got [\w -]{0,30} (?:on tap|scheduled|planned) today\b/i,
  ],
  rodeToday: [
    /\b(?:nice|great|good|solid|strong) (?:ride|work|job|effort|session) (?:today|this morning)\b/i,
    /\byou (?:already )?(?:rode|did|completed|crushed|finished|nailed) (?:it |that |your ride |your workout )?(?:today|this morning)\b/i,
    /\b(?:after|since) (?:today'?s|this morning'?s) (?:ride|session|workout)\b/i,
  ],
};

const hit = (reply: string, patterns: RegExp[]) => patterns.find((p) => p.test(reply));

/** Returns human-readable contradictions (empty = reply is consistent with the DB). */
export function findStateContradictions(reply: string, facts: StateFacts, opts: GuardOptions = {}): string[] {
  const out: string[] = [];
  if (!reply) return out;
  if (!opts.stateChangePending) {
    if (facts.activePlans === 0 && hit(reply, CLAIMS.planExists)) {
      out.push('Your reply says the athlete has an existing/active training plan — the database shows NO active plan.');
    }
    if (facts.upcomingWorkouts === 0 && hit(reply, CLAIMS.workoutScheduled)) {
      out.push('Your reply says workouts are scheduled/on the calendar — the calendar is EMPTY from today on.');
    } else if (!facts.workoutToday && hit(reply, CLAIMS.workoutToday)) {
      out.push("Your reply refers to today's scheduled workout — NOTHING is scheduled today.");
    }
  }
  if (!facts.rodeToday && hit(reply, CLAIMS.rodeToday)) {
    out.push('Your reply says the athlete rode/trained today — NO ride is recorded today.');
  }
  return out;
}

export function describeFacts(f: StateFacts): string {
  return [
    `active training plans: ${f.activePlans || 'NONE'}`,
    `workouts on the calendar from today: ${f.upcomingWorkouts || 'NONE (empty)'}`,
    `workout scheduled today: ${f.workoutToday ? 'yes' : 'no'}`,
    `ridden today: ${f.rodeToday ? 'yes' : 'no'}`,
  ].join('; ');
}
