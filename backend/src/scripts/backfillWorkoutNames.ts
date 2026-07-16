import 'dotenv/config';
import { supabaseAdmin } from '../utils/supabase';

/**
 * One-off backfill: fix AI-generated ("Draft - ") workout names whose numeric
 * "NxM" structure claim contradicts the intervals actually stored (and drawn in
 * the graphic) — e.g. "Draft - Sweet Spot 2x12" whose builder produced 3×12.
 *
 * SURGICAL on purpose: it only rewrites the "NxM" token, and only when it's
 * wrong, preserving the rest of the descriptive name (so "Over-Unders",
 * "Sweet Spot ...", week tags, etc. survive). It skips names with no NxM token,
 * mixed-structure sessions (over-unders), and ones already correct. It does NOT
 * trust the stored workout_type (older sweet-spot rides are stored as
 * 'threshold'); reps/work-length come straight from the interval durations.
 *
 * Name-only update: calendar entries link by workout_id and intervals.icu keys
 * off the preserved "Draft -" prefix, so nothing else is affected.
 *
 * Dry run:  ts-node src/scripts/backfillWorkoutNames.ts
 * Apply:    ts-node src/scripts/backfillWorkoutNames.ts --apply
 */

const APPLY = process.argv.includes('--apply');
// "3x12", "5x3min", "8x40sec" — capture reps, number, optional unit.
const NXM = /(\d+)\s*[xX]\s*(\d+)\s*(secs?|s|mins?|m)?/i;

(async () => {
  // Page through every "Draft - " workout.
  const page = 1000;
  let from = 0;
  let all: any[] = [];
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('workouts')
      .select('id, name, workout_type, intervals')
      .ilike('name', 'Draft - %')
      .range(from, from + page - 1);
    if (error) {
      console.error('Query failed:', error);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < page) break;
    from += page;
  }
  console.log(`Fetched ${all.length} "Draft - " workouts`);

  const changes: { id: string; old: string; next: string }[] = [];
  for (const w of all) {
    const m = w.name.match(NXM);
    if (!m) continue; // no structural claim in the name — leave it (graphic caption covers it)

    const ivs = Array.isArray(w.intervals) ? w.intervals : [];
    // Expand repeat counts, keep only work blocks — what an athlete counts.
    const work: number[] = [];
    for (const iv of ivs) {
      if (iv?.type !== 'work') continue;
      const count = Math.max(1, Number(iv.repeat) || 1);
      for (let i = 0; i < count; i++) work.push(Number(iv.duration) || 0);
    }
    if (work.length <= 1) continue; // steady / single block — don't touch the name
    if (!work.every((d) => d === work[0])) continue; // mixed structure (over-unders) — leave it

    const reps = work.length;
    const durSec = work[0];
    // Compare in seconds so "5x3min" vs a 180s block and "8x40sec" vs a 40s
    // block both resolve correctly regardless of the unit the name used.
    const claimedReps = Number(m[1]);
    const claimedNum = Number(m[2]);
    const claimedIsSec = (m[3] || '').toLowerCase().startsWith('s');
    const claimedSec = claimedIsSec ? claimedNum : claimedNum * 60;
    if (claimedReps === reps && claimedSec === durSec) continue; // already accurate

    // Rewrite the token in the correct unit: seconds for sub-minute work, else minutes.
    const actualIsSec = durSec < 60;
    const val = actualIsSec ? durSec : Math.round(durSec / 60);
    const unit = actualIsSec ? 'sec' : m[3] ? 'min' : '';
    const next = w.name.replace(NXM, `${reps}x${val}${unit}`);
    if (next !== w.name) changes.push({ id: w.id, old: w.name, next });
  }

  console.log(`${changes.length} workouts need renaming\n`);
  for (const c of changes.slice(0, 20)) console.log(`  "${c.old}"\n    -> "${c.next}"`);
  if (changes.length > 20) console.log(`  … and ${changes.length - 20} more`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write.');
    process.exit(0);
  }

  let done = 0;
  for (const c of changes) {
    const { error } = await supabaseAdmin.from('workouts').update({ name: c.next }).eq('id', c.id);
    if (error) console.error(`  FAIL ${c.id}: ${error.message}`);
    else done++;
  }
  console.log(`\nApplied ${done}/${changes.length} renames.`);
  process.exit(0);
})();
