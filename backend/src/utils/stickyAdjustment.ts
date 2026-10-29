/**
 * Keep today's "Suggested: swap X for Y" card stable.
 *
 * Oct 29 2026: at 6:49 the card said "Swap sprints for Z2 endurance" (WHOOP
 * yellow, HRV -10%, short sleep, race 2 days ago). The suggestion lives in an
 * in-memory cache that a check-in / ride sync / restart clears, and the
 * regenerated AI call at 6:50 rolled "Sprint workout matches readiness; keep it
 * sharp" — same data, opposite call, card gone. A coach doesn't flip-flop.
 *
 * So the first adjustment offered for today's planned workout is stored on the
 * calendar entry and reused until the athlete accepts or dismisses it, and the
 * AI is told what it already recommended so its summary agrees with the card.
 */

export interface StoredAdjustment {
  kind: 'rest' | 'easier';
  headline: string;
  reason: string;
  replacement?: { type?: string; duration_minutes?: number };
  /** The planned workout this was about — a different workout means it's stale. */
  workout_id: string;
  date: string;
  generatedAt: string;
}

/** The stored adjustment if it's for this entry's current workout today, else null. */
export function stickyAdjustmentFor(
  entry: { workout_id?: string | null; suggested_adjustment?: any } | null | undefined,
  todayStr: string
): StoredAdjustment | null {
  const s = entry?.suggested_adjustment;
  if (!s || !entry?.workout_id) return null;
  if (s.workout_id !== entry.workout_id || s.date !== todayStr) return null;
  if (s.kind !== 'rest' && s.kind !== 'easier') return null;
  return s as StoredAdjustment;
}

/** Appended to the AI context so the summary/key points match the card. */
export function stickyAdjustmentNote(s: StoredAdjustment, dismissed = false): string {
  if (dismissed) {
    return `

ALREADY DISCUSSED TODAY: earlier this morning you suggested "${s.headline}" — ${s.reason}
The athlete chose "Continue with plan". Respect that: don't re-argue the swap. Coach them through the planned session sensibly for today's readiness (e.g. full warm-up, stop the reps if quality drops), without pretending readiness is better than it is.`;
  }
  return `

ALREADY RECOMMENDED TODAY: earlier this morning you told the athlete "${s.headline}" — ${s.reason}
The athlete is looking at that suggestion card right now (Accept suggestion / Continue with plan). Stay consistent: your summary, recommendation and key points must support that call, and your "adjustment" must repeat it. Do NOT tell them the planned workout is fine — nothing has changed since you made the call.`;
}
