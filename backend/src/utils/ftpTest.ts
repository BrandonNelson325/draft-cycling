/** An FTP test is stored as workout_type 'custom' (no DB migration needed) and
 *  identified by the `ftp_test` marker on its 20-min block. */
export function isFtpTestWorkout(w: { intervals?: any[] | null }): boolean {
  return Array.isArray(w?.intervals) && w.intervals.some((iv: any) => iv?.ftp_test);
}
