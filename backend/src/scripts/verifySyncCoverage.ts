/**
 * RULE: every change to a scheduled workout in Draft must reach every connected
 * integration (Wahoo, intervals.icu, and any added later). That only holds if
 * calendar/workout writes go through integrationSyncService.
 *
 * This scans the backend for raw writes to `calendar_entries` / `workouts` and
 * fails on any that aren't in the reviewed list below. Oct 22 2026: four paths
 * (coach clear-range, template scheduling, plan retire/delete, workout edits)
 * silently skipped the sync and left stale workouts on head units.
 *
 * New write? Route it through integrationSyncService (deleteEntries /
 * mirrorUpload / mirrorMove / resyncWorkout / removeWorkoutRemotes), or — if it
 * genuinely can't affect what's synced — add it below WITH the reason.
 *
 * Run: npm run test:sync-coverage
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');

/** file → number of raw writes reviewed, and why they're fine. */
const REVIEWED: Record<string, { count: number; why: string }> = {
  'services/integrationSyncService.ts': { count: 1, why: 'deleteEntries itself' },
  'services/calendarService.ts': { count: 8, why: 'schedule/bulk-schedule/move/update/rest-day/delete each mirror via integrationSyncService (refs captured before deletes); complete only marks done' },
  'services/dailyAnalysisService.ts': { count: 2, why: 'creates a workout from a template (not scheduled yet — scheduling syncs it); stores the suggested-adjustment text on today\'s entry (workout unchanged)' },
  'controllers/dailyAnalysisController.ts': { count: 2, why: 'accept suggestion → mirrorMove / deleteRemotes; makeup day gets the original → mirrorMove' },
  'services/activityMatchingService.ts': { count: 3, why: 'marks entries completed / links the ride — nothing to sync' },
  'services/ftpTestService.ts': { count: 1, why: 'marks the FTP test completed with its note' },
  'services/aiToolExecutor.ts': { count: 1, why: 'inserts plan rest-day markers (no workout to sync)' },
  'services/trainingPlanService.ts': { count: 2, why: 'inserts plan rest-day markers; deletes a plan\'s workouts AFTER deleteEntries removed their remotes' },
  'services/workoutService.ts': { count: 3, why: 'createWorkout (unscheduled); updateWorkout → resyncWorkout; deleteWorkout → removeWorkoutRemotes' },
};

const WRITE = /\.(delete|update|insert|upsert)\(/;
const TABLE = /from\('(calendar_entries|workouts)'\)/;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'scripts' ? [] : walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

const found: Record<string, string[]> = {};
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((l, i) => {
    if (!TABLE.test(l)) return;
    // The write call is on the same line or within the next few chained lines.
    const chain = lines.slice(i, i + 4).join(' ');
    const m = chain.match(WRITE);
    if (m) {
      // A select() before the write in the chain means this is a read.
      const selIdx = chain.indexOf('.select(');
      if (selIdx !== -1 && selIdx < chain.indexOf(m[0])) return;
      (found[rel] ||= []).push(`${rel}:${i + 1} ${m[1]}`);
    }
  });
}

let failures = 0;
for (const [file, hits] of Object.entries(found)) {
  const reviewed = REVIEWED[file];
  if (!reviewed) {
    failures++;
    console.log(`✗ FAIL  Unreviewed calendar/workout write(s) in ${file} — route through integrationSyncService:\n   ${hits.join('\n   ')}`);
  } else if (hits.length > reviewed.count) {
    failures++;
    console.log(`✗ FAIL  ${file}: ${hits.length} raw writes, ${reviewed.count} reviewed — a new one skips the sync?\n   ${hits.join('\n   ')}`);
  } else {
    console.log(`✓ PASS  ${file}: ${hits.length} write(s) — ${reviewed.why}`);
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nEvery calendar/workout write is synced or reviewed');
process.exit(failures ? 1 : 0);
