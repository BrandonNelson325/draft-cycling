/**
 * Proves the duplicate-plan guard: two plan-build enqueues in the same
 * conversation (the AI re-calling the tool, or a stream→fallback re-run)
 * must create only ONE background job, not two — so the athlete never gets
 * duplicated training plans.
 *
 * Run: npm run test:plan-dedup
 */
import { trainingPlanJobService } from '../services/trainingPlanJobService';
import { supabaseAdmin } from '../utils/supabase';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

// In-memory stand-in for the training_plan_jobs table.
const jobs: any[] = [];
let idCounter = 1;
(supabaseAdmin as any).from = () => {
  let insertRow: any = null;
  const eqFilters: Record<string, any> = {};
  const builder: any = {
    select: () => builder,
    eq: (col: string, val: any) => { eqFilters[col] = val; return builder; },
    in: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    insert: (row: any) => { insertRow = row; return builder; },
    single: async () => {
      const r = { id: `job-${idCounter++}`, created_at: new Date().toISOString(), ...insertRow };
      jobs.push(r);
      return { data: r, error: null };
    },
    // dedup query is awaited directly (thenable) — return jobs matching the eq filters
    then: (resolve: any) =>
      resolve({
        data: jobs.filter((j) => Object.entries(eqFilters).every(([k, v]) => j[k] === v)),
        error: null,
      }),
  };
  return builder;
};

(async () => {
  console.log('Verifying duplicate-plan guard\n');

  const convId = 'conversation-1';
  const params = { goal_event: '200-mile TTT', event_date: '2026-09-12' };

  // First build — should create a job.
  const job1 = await trainingPlanJobService.enqueue('athlete-1', convId, 'generate_training_plan', params);
  // Second build, same conversation moments later (the bug scenario).
  const job2 = await trainingPlanJobService.enqueue('athlete-1', convId, 'generate_training_plan', params);

  check('Only ONE job row is created for two enqueues', jobs.length === 1, `${jobs.length} jobs created`);
  check('Second enqueue reuses the first job (no duplicate plan)', job1.id === job2.id, `job1=${job1.id} job2=${job2.id}`);

  // A DIFFERENT conversation should still get its own job (no false dedup).
  const job3 = await trainingPlanJobService.enqueue('athlete-1', 'conversation-2', 'generate_training_plan', params);
  check('A different conversation still gets its own job', jobs.length === 2 && job3.id !== job1.id, `${jobs.length} jobs, job3=${job3.id}`);

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
