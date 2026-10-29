/**
 * When today's hard session gets swapped for something easier, find where it
 * can still happen. Oct 29 2026: "Swap sprints for Z2" just dropped the sprints
 * — a coach would say "do the easy ride today and the sprints tomorrow".
 *
 * Rule: the first EASY ride (endurance / recovery) in the next few days, that
 * isn't a planned rest day, where the hard session wouldn't land next to
 * another hard day. Accepting then SWAPS the two days — the athlete rides that
 * easy session today and the original moves there. Pure, so it's testable.
 */
import { backToBackConflict, isHardWorkout, type DayLoad } from './backToBack';

const EASY_TYPES = new Set(['endurance', 'recovery']);
export const MAKEUP_LOOKAHEAD_DAYS = 3;

export interface PlannedDay {
  date: string; // YYYY-MM-DD
  /** More than one session that day — never swap into it (still counts for load). */
  locked?: boolean;
  entry: {
    id: string;
    entry_type?: string | null;
    completed?: boolean | null;
    workout?: { id: string; name: string; workout_type?: string | null; duration_minutes?: number | null; tss?: number | null } | null;
  } | null;
}

export interface MakeupSlot {
  date: string;
  entryId: string;
  workout: { id: string; name: string; workout_type: string; duration_minutes: number; tss: number };
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function plannedLoad(day: PlannedDay | undefined): DayLoad {
  const w = day?.entry && !day.entry.completed && day.entry.entry_type !== 'rest' ? day.entry.workout : null;
  return { rides: [], planned: w ? [{ name: w.name, workout_type: w.workout_type }] : [] };
}

/**
 * @param original today's planned workout being swapped out
 * @param days planned calendar from today through today + MAKEUP_LOOKAHEAD_DAYS + 1
 */
export function findMakeupSlot(
  original: { name: string; workout_type?: string | null },
  todayStr: string,
  days: PlannedDay[]
): MakeupSlot | null {
  if (!isHardWorkout(original)) return null;
  const byDate = new Map(days.map((d) => [d.date, d]));

  for (let i = 1; i <= MAKEUP_LOOKAHEAD_DAYS; i++) {
    const date = addDays(todayStr, i);
    const day = byDate.get(date);
    const e = day?.entry;
    const w = e?.workout;
    if (!e || !w || day?.locked || e.completed || e.entry_type === 'rest') continue;
    if (!EASY_TYPES.has(String(w.workout_type)) || isHardWorkout(w)) continue;

    // After the swap, today holds this easy ride — so the day before is easy.
    const before = i === 1 ? { rides: [], planned: [] } : plannedLoad(byDate.get(addDays(date, -1)));
    const after = plannedLoad(byDate.get(addDays(date, 1)));
    if (backToBackConflict(original, before, after)) continue;

    return {
      date,
      entryId: e.id,
      workout: {
        id: w.id,
        name: w.name,
        workout_type: String(w.workout_type),
        duration_minutes: w.duration_minutes || 0,
        tss: Math.round(w.tss || 0),
      },
    };
  }
  return null;
}

/** "tomorrow" / "Saturday" — for the card text. */
export function dayLabel(todayStr: string, date: string): string {
  if (date === addDays(todayStr, 1)) return 'tomorrow';
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

/** Sentence appended to the card's reason so the athlete sees what Accept does. */
export function makeupSentence(originalName: string, kind: 'rest' | 'easier', slot: MakeupSlot, todayStr: string): string {
  const when = dayLabel(todayStr, slot.date);
  const short = originalName.replace(/^Draft - /, '').split(' · ')[0];
  const easy = slot.workout.name.replace(/^Draft - /, '');
  return kind === 'easier'
    ? ` Accepting moves ${short} to ${when} — you ride ${when === 'tomorrow' ? "tomorrow's" : `${when}'s`} ${easy} (${slot.workout.duration_minutes} min) today instead.`
    : ` Accepting moves ${short} to ${when} in place of the ${easy}.`;
}
