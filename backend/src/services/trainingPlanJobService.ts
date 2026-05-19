import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { sendPushNotification } from './pushNotificationService';

/**
 * Background job service for long-running plan builds.
 *
 * Why this exists:
 *   Plan builds (creating 20-60 workouts + scheduling them + saving the
 *   training_plans record) routinely take 60-180 seconds. Doing that work
 *   inside the chat HTTP request causes:
 *     - Railway HTTP timeouts (~5 min upstream proxy)
 *     - Mobile clients giving up on the stream
 *     - The optimistic message disappearing with no recovery path
 *     - 5x cost (the AI loop iterates trying to drive the long tool)
 *
 *   This service breaks the cycle by accepting the plan parameters, kicking
 *   off the actual work in a fire-and-forget promise, and returning a job ID
 *   immediately. When the background work finishes, we write a follow-up
 *   assistant message into the chat conversation + send a push notification.
 *
 *   From the user's POV: chat acknowledges in ~5s ("building, ~60s, ping when
 *   done"), background runs to completion, push arrives, refresh shows the
 *   plan-built message.
 */

export type PlanJobKind = 'from_templates' | 'training_plan_template' | 'generate_training_plan';

export interface PlanJobRow {
  id: string;
  athlete_id: string;
  conversation_id: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed';
  params: any;
  result: any;
  error_message: string | null;
  summary: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

// Executor callbacks injected at startup by aiToolExecutor (avoids a circular
// import between this file and aiToolExecutor.ts).
type Executor = (athleteId: string, params: any) => Promise<any>;
const executors: Partial<Record<PlanJobKind, Executor>> = {};

export function registerPlanJobExecutor(kind: PlanJobKind, fn: Executor) {
  executors[kind] = fn;
}

export const trainingPlanJobService = {
  /**
   * Enqueue a plan-build job and kick off background execution.
   * Returns the job row so the caller can include the job_id in the tool result.
   */
  async enqueue(
    athleteId: string,
    conversationId: string | null,
    kind: PlanJobKind,
    params: any
  ): Promise<PlanJobRow> {
    // Stash the kind inside params so we don't need another migration to add
    // a typed column — the job table is intentionally simple/opaque.
    const { data, error } = await supabaseAdmin
      .from('training_plan_jobs')
      .insert({
        athlete_id: athleteId,
        conversation_id: conversationId,
        status: 'queued',
        params: { _kind: kind, ...params },
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to enqueue plan job: ${error.message}`);
    }

    // Fire-and-forget with a short delay so the AI's "plan is building" ack
    // message has time to finish streaming + persist before the job posts
    // its result message. Otherwise a fast-failing job (e.g. missing FTP
    // check fires in <100ms) lands its error chat message BEFORE the ack,
    // and the user sees the messages out of order.
    setTimeout(() => {
      void this.runJob(data as PlanJobRow, kind);
    }, 3000);

    return data as PlanJobRow;
  },

  /**
   * Internal background executor. Wraps the underlying plan-build call,
   * updates job status, persists a follow-up chat message, sends push.
   */
  async runJob(job: PlanJobRow, kind: PlanJobKind): Promise<void> {
    const startedAt = new Date().toISOString();
    await supabaseAdmin
      .from('training_plan_jobs')
      .update({ status: 'running', started_at: startedAt })
      .eq('id', job.id);

    const executor = executors[kind];
    if (!executor) {
      logger.error(`[PlanJob] No executor registered for kind=${kind}`);
      await this.markFailed(job, `No executor registered for kind=${kind}`);
      return;
    }

    // Strip _kind out before passing params to the executor.
    const { _kind, ...executorParams } = job.params || {};

    try {
      logger.info(`[PlanJob ${job.id}] Starting ${kind} for athlete ${job.athlete_id}`);
      const result = await executor(job.athlete_id, executorParams);
      logger.info(`[PlanJob ${job.id}] Completed`);

      // Build a one-paragraph summary the assistant message can use.
      const summary = this.buildSummary(kind, job.params, result);

      await supabaseAdmin
        .from('training_plan_jobs')
        .update({
          status: 'completed',
          result,
          summary,
          finished_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      await this.writeAssistantMessage(job, summary);
      await this.notify(job.athlete_id, 'Training plan ready', 'Your new plan is on your calendar. Open the chat to see the details.');
    } catch (err: any) {
      logger.error(`[PlanJob ${job.id}] Failed:`, err);
      await this.markFailed(job, err?.message || 'Unknown error');
    }
  },

  async markFailed(job: PlanJobRow, errorMessage: string): Promise<void> {
    await supabaseAdmin
      .from('training_plan_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    await this.writeAssistantMessage(
      job,
      `I hit an error while building your plan: ${errorMessage}. Try again, or let me know what to do differently.`
    );
    await this.notify(job.athlete_id, 'Plan build failed', 'Open the app to see what went wrong.');
  },

  buildSummary(kind: PlanJobKind, params: any, result: any): string {
    // Fall back to a generic summary if the executor didn't return rich data.
    const goalEvent = params?.goal_event ? ` for "${params.goal_event}"` : '';
    const weeks = result?.weeks_count || result?.week_count;
    const workouts = result?.workouts_created || result?.scheduled_count;
    const startDate = result?.start_date || params?.start_date;
    const endDate = result?.end_date || params?.event_date;

    const parts: string[] = [`Your training plan${goalEvent} is on your calendar.`];
    if (weeks) parts.push(`${weeks} weeks`);
    if (workouts) parts.push(`${workouts} workouts scheduled`);
    if (startDate && endDate) parts.push(`running ${startDate} → ${endDate}`);

    return parts.length > 1
      ? `${parts[0]} ${parts.slice(1).join(' · ')}.`
      : parts[0];
  },

  /**
   * Write a new assistant message into the conversation the user started the
   * job in. If conversation_id is missing (rare), we skip — better to lose the
   * follow-up than write to a stranger's chat.
   */
  async writeAssistantMessage(job: PlanJobRow, content: string): Promise<void> {
    if (!job.conversation_id) {
      logger.warn(`[PlanJob ${job.id}] No conversation_id, skipping chat message`);
      return;
    }
    const { error } = await supabaseAdmin.from('chat_messages').insert({
      conversation_id: job.conversation_id,
      athlete_id: job.athlete_id,
      role: 'assistant',
      content,
    });
    if (error) {
      logger.error(`[PlanJob ${job.id}] Failed to write chat message:`, error.message);
    }
  },

  async notify(athleteId: string, title: string, body: string): Promise<void> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('push_token, push_notifications_enabled')
      .eq('id', athleteId)
      .single();
    if (!athlete?.push_token || !athlete?.push_notifications_enabled) return;
    try {
      await sendPushNotification(athlete.push_token, title, body, { type: 'plan_job_done' });
    } catch (err) {
      logger.warn('[PlanJob] Push send failed:', err);
    }
  },
};
