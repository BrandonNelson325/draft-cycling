/** An FTP test is stored as workout_type 'custom' (no DB migration needed) and
 *  identified by the `ftp_test` marker on its 20-min block. */
export function isFtpTestWorkout(w: { intervals?: any[] | null }): boolean {
  return Array.isArray(w?.intervals) && w.intervals.some((iv: any) => iv?.ftp_test);
}

/** A fixed weekly commitment (e.g. a Tuesday ZRL race) — marked `fixed` on its
 *  intervals. The plan is built AROUND it; nothing may move, drop or demote it. */
export function isFixedSession(w: { intervals?: any[] | null }): boolean {
  return Array.isArray(w?.intervals) && w.intervals.some((iv: any) => iv?.fixed);
}

/** A HARD fixed commitment (race / hard group ride) counts as a quality session. */
export function isHardFixedSession(w: { intervals?: any[] | null }): boolean {
  return Array.isArray(w?.intervals) && w.intervals.some((iv: any) => iv?.fixed && iv?.race);
}
