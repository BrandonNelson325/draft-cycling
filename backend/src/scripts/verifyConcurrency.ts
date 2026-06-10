/**
 * Proves mapWithConcurrency caps in-flight work (so a plan build can't open
 * 250+ DB connections at once and exhaust Supabase's pool → PGRST003) while
 * still completing every item and preserving order.
 *
 * Run: npm run test:concurrency
 */
import { mapWithConcurrency } from '../utils/concurrency';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

(async () => {
  console.log('Verifying mapWithConcurrency (connection-burst guard)\n');

  const N = 84; // an 84-workout plan, like the deterministic generator produces
  const LIMIT = 5;
  let inFlight = 0;
  let peak = 0;

  const items = Array.from({ length: N }, (_, i) => i);
  const results = await mapWithConcurrency(items, LIMIT, async (item) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    // simulate a DB round-trip
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return item * 2;
  });

  check(`Never exceeds the concurrency cap of ${LIMIT}`, peak <= LIMIT, `peak in-flight = ${peak}`);
  check('Actually used the concurrency (not accidentally serial)', peak > 1, `peak = ${peak}`);
  check('Completed every item', results.length === N, `${results.length}/${N}`);
  check('Preserved input order', results.every((v, i) => v === i * 2), 'results match index*2');

  // Edge cases
  const empty = await mapWithConcurrency<number, number>([], 5, async (x) => x);
  check('Handles empty input', empty.length === 0);

  const fewer = await mapWithConcurrency([1, 2], 10, async (x) => x + 1);
  check('Handles items < limit', fewer.length === 2 && fewer[0] === 2 && fewer[1] === 3);

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
