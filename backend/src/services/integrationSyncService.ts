import { supabaseAdmin } from '../utils/supabase';
import { intervalsIcuService } from './intervalsIcuService';
import { wahooService } from './wahooService';
import { logger } from '../utils/logger';

/**
 * One place that mirrors calendar changes out to every connected integration.
 *
 * WHY THIS EXISTS — the duplicate-workout bug:
 * `workout_syncs.calendar_entry_id` is `ON DELETE CASCADE`. The old delete
 * paths fired the remote delete WITHOUT awaiting it and then immediately
 * deleted the calendar entry, so the cascade wiped the workout_syncs row —
 * the only copy of `external_id` — before the remote-delete call could read
 * it. It found nothing, returned silently, and the remote event was orphaned
 * forever. The adapted workout then uploaded as a NEW event, so the athlete
 * saw BOTH the old and the new workout.
 *
 * THE RULE: capture refs (fast local read, awaited) → delete locally → fire
 * the slow remote deletes using the captured refs. Correct AND non-blocking.
 * Never read workout_syncs after the local row is gone.
 *
 * Adding a new integration (Garmin, Zwift, …) = one entry in each registry
 * below; every calendar path then mirrors to it automatically.
 *
 * RULE: every change to a calendar entry or a scheduled workout must go
 * through this service (deleteEntries / mirrorUpload / mirrorMove /
 * resyncWorkout / removeWorkoutRemotes). Raw deletes/updates on
 * calendar_entries elsewhere orphan or stale the athlete's head unit.
 * `npm run test:sync-coverage` enforces it.
 */

export type IntegrationKey = 'intervals_icu' | 'wahoo';

/** A captured pointer to a remote event, safe to use after the local row dies. */
export interface SyncRef {
  integration: IntegrationKey;
  externalId: string;
}

/** Deletes one remote event. Must tolerate a 404 (already gone). */
const deleters: Record<IntegrationKey, (athleteId: string, externalId: string) => Promise<void>> = {
  intervals_icu: (athleteId, externalId) => intervalsIcuService.deleteWorkout(athleteId, externalId),
  wahoo: (athleteId, externalId) => wahooService.deleteWorkout(athleteId, externalId),
};

/** Uploads/schedules one workout. */
const uploaders: Record<
  IntegrationKey,
  (athleteId: string, workoutId: string, date: Date, calendarEntryId: string) => Promise<unknown>
> = {
  intervals_icu: (a, w, d, c) => intervalsIcuService.uploadWorkout(a, w, d, c),
  wahoo: (a, w, d, c) => wahooService.uploadWorkout(a, w, d, c),
};

/** Which athlete columns gate auto-sync for each integration. */
const enabledChecks: Record<IntegrationKey, (athlete: any) => boolean> = {
  intervals_icu: (a) => !!a?.intervals_icu_auto_sync && !!a?.intervals_icu_access_token,
  wahoo: (a) => !!a?.wahoo_auto_sync && !!a?.wahoo_access_token,
};

const ATHLETE_SYNC_COLUMNS =
  'intervals_icu_auto_sync, intervals_icu_access_token, wahoo_auto_sync, wahoo_access_token';

const backfillsRunning = new Set<string>();

export const integrationSyncService = {
  /** Integrations this athlete has connected AND enabled auto-sync for. */
  async activeIntegrations(athleteId: string): Promise<IntegrationKey[]> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select(ATHLETE_SYNC_COLUMNS)
      .eq('id', athleteId)
      .single();
    if (!athlete) return [];
    return (Object.keys(enabledChecks) as IntegrationKey[]).filter((k) => enabledChecks[k](athlete));
  },

  /**
   * Read the remote ids for these calendar entries BEFORE anything deletes
   * them locally. MUST be awaited and MUST run before the local delete —
   * this is the whole fix for the duplicate bug.
   */
  async captureRefs(athleteId: string, calendarEntryIds: string[]): Promise<SyncRef[]> {
    if (!calendarEntryIds.length) return [];
    const { data } = await supabaseAdmin
      .from('workout_syncs')
      .select('integration, external_id')
      .eq('athlete_id', athleteId)
      .in('calendar_entry_id', calendarEntryIds)
      .eq('sync_status', 'synced')
      .not('external_id', 'is', null);

    return (data || [])
      .filter((r: any) => r.external_id && r.integration in deleters)
      .map((r: any) => ({ integration: r.integration as IntegrationKey, externalId: r.external_id }));
  },

  /**
   * Delete the captured remote events. Fire-and-forget by design: a slow or
   * failing third party must never block the athlete's calendar action. Safe
   * to call after the local rows are gone, because refs were captured first.
   */
  deleteRemotes(athleteId: string, refs: SyncRef[]): void {
    for (const ref of refs) {
      deleters[ref.integration](athleteId, ref.externalId).catch((err: any) => {
        // 404 just means it was already removed on their side.
        if (err?.response?.status !== 404) {
          logger.warn(
            `[Sync] ${ref.integration}: failed to delete remote event ${ref.externalId}: ${err.message}`
          );
        }
      });
    }
  },

  /**
   * Convenience for the common "remove these calendar entries" flow:
   * capture → (caller deletes locally) → delete remotes.
   * Returns the refs so the caller can delete locally in between.
   */
  async captureForDeletion(athleteId: string, calendarEntryIds: string[]): Promise<SyncRef[]> {
    try {
      return await this.captureRefs(athleteId, calendarEntryIds);
    } catch (err: any) {
      logger.warn(`[Sync] captureRefs failed: ${err.message}`);
      return [];
    }
  },

  /**
   * THE way to delete calendar entries. Captures every remote ref first, deletes
   * locally, then removes the remote copies — so no integration is left holding
   * a workout that's gone from Draft. Returns the number deleted.
   */
  async deleteEntries(athleteId: string, entryIds: string[]): Promise<number> {
    if (!entryIds.length) return 0;
    const refs = await this.captureForDeletion(athleteId, entryIds);
    const { data, error } = await supabaseAdmin
      .from('calendar_entries')
      .delete()
      .in('id', entryIds)
      .eq('athlete_id', athleteId)
      .select('id');
    if (error) throw new Error(`Failed to delete calendar entries: ${error.message}`);
    this.deleteRemotes(athleteId, refs);
    return data?.length || 0;
  },

  /**
   * A workout's CONTENT changed (intervals, name, duration): re-push every
   * upcoming, uncompleted calendar entry that uses it, to every integration.
   */
  async resyncWorkout(athleteId: string, workoutId: string): Promise<void> {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const { data: entries } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, scheduled_date')
      .eq('athlete_id', athleteId)
      .eq('workout_id', workoutId)
      .eq('completed', false)
      .gte('scheduled_date', yesterday);
    for (const e of entries || []) {
      const [y, m, d] = String(e.scheduled_date).split('-').map(Number);
      await this.mirrorMove(athleteId, e.id, workoutId, new Date(y, m - 1, d));
    }
  },

  /**
   * A workout is about to be DELETED: workout_syncs rows cascade with it, so
   * capture + remove the remote copies first.
   */
  async removeWorkoutRemotes(athleteId: string, workoutId: string): Promise<void> {
    const { data } = await supabaseAdmin
      .from('workout_syncs')
      .select('integration, external_id')
      .eq('athlete_id', athleteId)
      .eq('workout_id', workoutId)
      .eq('sync_status', 'synced')
      .not('external_id', 'is', null);
    const refs = (data || [])
      .filter((r: any) => r.external_id && r.integration in deleters)
      .map((r: any) => ({ integration: r.integration as IntegrationKey, externalId: r.external_id }));
    this.deleteRemotes(athleteId, refs);
  },

  /**
   * An integration was just CONNECTED (or auto-sync turned on): push every
   * upcoming, uncompleted workout so the device has the plan immediately —
   * otherwise nothing appears until something on the calendar changes.
   */
  async backfill(athleteId: string, key: IntegrationKey, days = 14): Promise<number> {
    // Connect + the auto-sync toggle both trigger this within seconds; two
    // overlapping runs each pushed every workout (Oct 27 2026: duplicates).
    const lock = `${athleteId}:${key}`;
    if (backfillsRunning.has(lock)) return 0;
    backfillsRunning.add(lock);
    try {
      return await this.runBackfill(athleteId, key, days);
    } finally {
      backfillsRunning.delete(lock);
    }
  },

  async runBackfill(athleteId: string, key: IntegrationKey, days: number): Promise<number> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes').select(ATHLETE_SYNC_COLUMNS).eq('id', athleteId).single();
    if (!enabledChecks[key](athlete)) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const until = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const { data: entries } = await supabaseAdmin
      .from('calendar_entries')
      .select('id, workout_id, scheduled_date')
      .eq('athlete_id', athleteId)
      .eq('completed', false)
      .not('workout_id', 'is', null)
      .gte('scheduled_date', today)
      .lte('scheduled_date', until)
      .order('scheduled_date');

    let pushed = 0;
    for (const e of entries || []) {
      const [y, m, d] = String(e.scheduled_date).split('-').map(Number);
      try {
        // mirrorMove semantics for one integration: drop any stale remote first.
        const refs = (await this.captureRefs(athleteId, [e.id])).filter((r) => r.integration === key);
        for (const r of refs) {
          await deleters[key](athleteId, r.externalId).catch(() => undefined);
        }
        await uploaders[key](athleteId, e.workout_id, new Date(y, m - 1, d, 12), e.id);
        pushed++;
      } catch (err: any) {
        logger.warn(`[Sync] ${key}: backfill failed for entry ${e.id}: ${err.message}`);
      }
    }
    logger.info(`[Sync] ${key}: backfilled ${pushed}/${entries?.length || 0} upcoming workouts for ${athleteId}`);
    return pushed;
  },

  /** Mirror a newly scheduled workout to every active integration. */
  async mirrorUpload(
    athleteId: string,
    workoutId: string,
    date: Date,
    calendarEntryId: string,
    skip: IntegrationKey[] = []
  ): Promise<void> {
    const active = (await this.activeIntegrations(athleteId)).filter((k) => !skip.includes(k));
    for (const key of active) {
      uploaders[key](athleteId, workoutId, date, calendarEntryId).catch((err: any) =>
        logger.error(`[Sync] ${key}: upload failed for entry ${calendarEntryId}: ${err.message}`)
      );
    }
  },

  /**
   * Mirror a move / workout swap on an EXISTING calendar entry: delete the old
   * remote event then re-upload at the new date. The local row survives here
   * (it's an UPDATE, no cascade), so we can read refs normally — but we still
   * capture first so the delete+upload can't race each other.
   */
  async mirrorMove(
    athleteId: string,
    calendarEntryId: string,
    workoutId: string,
    newDate: Date
  ): Promise<void> {
    const active = await this.activeIntegrations(athleteId);
    if (!active.length) return;

    const refs = await this.captureForDeletion(athleteId, [calendarEntryId]);

    for (const key of active) {
      const ref = refs.find((r) => r.integration === key);
      void (async () => {
        try {
          if (ref) {
            await deleters[key](athleteId, ref.externalId).catch((err: any) => {
              if (err?.response?.status !== 404) throw err;
            });
          }
          await uploaders[key](athleteId, workoutId, newDate, calendarEntryId);
        } catch (err: any) {
          logger.warn(`[Sync] ${key}: move resync failed for entry ${calendarEntryId}: ${err.message}`);
        }
      })();
    }

    // Mark the superseded sync rows so a later capture doesn't re-delete the
    // brand-new event we just uploaded against the same calendar entry.
    if (refs.length) {
      await supabaseAdmin
        .from('workout_syncs')
        .update({ sync_status: 'deleted', last_synced_at: new Date().toISOString() })
        .eq('athlete_id', athleteId)
        .eq('calendar_entry_id', calendarEntryId)
        .in('external_id', refs.map((r) => r.externalId));
    }
  },
};
