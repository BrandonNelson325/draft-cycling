/**
 * Run an async mapper over `items` with a hard cap on how many run at once.
 *
 * Why this exists: building a training plan creates/schedules dozens of
 * workouts. Firing them all with `Promise.all(items.map(...))` opens one DB
 * round-trip per item simultaneously — an 84-workout plan = 250+ concurrent
 * queries, which exhausts Supabase's PostgREST connection pool and surfaces as
 * `PGRST003: Timed out acquiring connection from connection pool` on EVERY
 * request (not just the plan build). Capping concurrency keeps the burst small
 * while still being far faster than fully sequential.
 *
 * Results are returned in input order. If any task throws, the whole call
 * rejects (same semantics as Promise.all).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
