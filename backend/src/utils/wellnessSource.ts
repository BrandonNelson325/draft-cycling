/**
 * Which wellness source owns a day. Several sources can report the same night
 * (WHOOP also writes to Apple Health), so a lower-priority source must never
 * overwrite a higher one — otherwise a late Apple Health sync would silently
 * replace WHOOP's recovery with a cruder number.
 */
export type WellnessSource = 'whoop' | 'apple_health' | 'intervals_icu' | 'manual';

const PRIORITY: Record<string, number> = { whoop: 4, apple_health: 3, intervals_icu: 2, manual: 1 };

/** True when `incoming` may write the day's wellness fields given what's stored. */
export function canWriteWellness(existing: string | null | undefined, incoming: WellnessSource): boolean {
  if (!existing) return true;
  return (PRIORITY[incoming] ?? 0) >= (PRIORITY[existing] ?? 0);
}
