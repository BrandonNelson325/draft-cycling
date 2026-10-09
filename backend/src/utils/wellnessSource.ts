/**
 * Which wellness source may write a day. WHOOP is protected: it's the athlete's
 * recovery source when connected, and Whoop ALSO writes to Apple Health — so
 * without this a later Apple Health / intervals.icu sync would replace Whoop's
 * recovery with a cruder number.
 *
 * Between the other sources the original behavior is kept (latest write wins):
 * athletes opt into intervals.icu OR Apple Health as their wellness source
 * (intervals_icu_use_wellness / apple_health_use_for_wellness), and ranking one
 * over the other would hide the data of someone who chose the "lower" one.
 */
export type WellnessSource = 'whoop' | 'apple_health' | 'intervals_icu' | 'manual';

/** True when `incoming` may write the day's wellness fields given what's stored. */
export function canWriteWellness(existing: string | null | undefined, incoming: WellnessSource): boolean {
  if (existing === 'whoop') return incoming === 'whoop';
  return true;
}
