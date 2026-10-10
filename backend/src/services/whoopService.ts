/**
 * WHOOP integration — Whoop is the athlete's RECOVERY source when connected
 * (recovery, HRV, RHR, sleep, strain, non-ride activities). Draft keeps owning
 * training decisions; this service only gets the data in, reliably.
 *
 * - OAuth 2.0 auth-code with the `offline` scope (refresh tokens). Whoop needs
 *   an 8-char `state`, so a one-time random state is stored on the athlete.
 * - Whoop ROTATES refresh tokens and invalidates old access tokens on refresh,
 *   so refreshes are serialized per athlete (two concurrent refreshes would
 *   leave one holding a dead refresh token → athlete silently disconnected).
 * - Data arrives by webhook (recovery/sleep/workout scored) with an on-demand
 *   pull as backup. Only SCORED records are used. See utils/whoopMapping.ts.
 */
import axios from 'axios';
import crypto from 'crypto';
import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { buildDailyWhoop } from '../utils/whoopMapping';
import { summarizeWhoop, buildRecoveryPush, WellnessDay } from '../utils/whoopCoaching';
import { sendWhoopRecoveryNotification } from './pushNotificationService';
import { todayInTimezone } from '../utils/timezone';

const API = 'https://api.prod.whoop.com/developer';
const AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';
const SCOPES = 'offline read:recovery read:sleep read:cycles read:workout read:profile';
export const WHOOP_BACKFILL_DAYS = 60;

const refreshInFlight = new Map<string, Promise<string>>();
const notifiedToday = new Set<string>();

function config() {
  // .trim(): a pasted env var with a trailing newline/space fails client auth.
  return {
    clientId: (process.env.WHOOP_CLIENT_ID || '').trim(),
    clientSecret: (process.env.WHOOP_CLIENT_SECRET || '').trim(),
    redirectUri: (process.env.WHOOP_REDIRECT_URI || 'https://api.draftcycling.com/api/integrations/whoop/callback').trim(),
  };
}

/**
 * POST to Whoop's token endpoint. Whoop's OAuth server (Ory Hydra) may be set
 * to client_secret_post (credentials in the form body — what the docs show) or
 * client_secret_basic (HTTP Basic header). Try post first; on invalid_client
 * retry with Basic so either app configuration works.
 */
async function tokenRequest(params: Record<string, string>): Promise<any> {
  const c = config();
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  try {
    const resp = await axios.post(TOKEN_URL, new URLSearchParams({ ...params, client_id: c.clientId, client_secret: c.clientSecret }).toString(), { headers });
    return resp.data;
  } catch (err: any) {
    if (err.response?.data?.error !== 'invalid_client') throw err;
    logger.warn('[Whoop] token endpoint rejected client_secret_post — retrying with HTTP Basic auth');
    const basic = Buffer.from(`${encodeURIComponent(c.clientId)}:${encodeURIComponent(c.clientSecret)}`).toString('base64');
    const resp = await axios.post(TOKEN_URL, new URLSearchParams(params).toString(), {
      headers: { ...headers, Authorization: `Basic ${basic}` },
    });
    return resp.data;
  }
}

export const whoopService = {
  /** Auth URL with a fresh one-time 8-char state stored on the athlete. */
  async getAuthUrl(athleteId: string, mobile: boolean): Promise<string> {
    const state = crypto.randomBytes(6).toString('base64url').slice(0, 8);
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({ whoop_oauth_state: state, whoop_oauth_mobile: mobile })
      .eq('id', athleteId);
    if (error) throw new Error(`Failed to start Whoop connect: ${error.message}`);
    const c = config();
    const params = new URLSearchParams({
      client_id: c.clientId, response_type: 'code', redirect_uri: c.redirectUri, scope: SCOPES, state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  /** Exchange the code; returns which athlete connected and whether it came from mobile. */
  async handleCallback(code: string, state: string): Promise<{ athleteId: string; mobile: boolean }> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes').select('id, whoop_oauth_mobile').eq('whoop_oauth_state', state).single();
    if (!athlete) throw new Error('Unknown or expired Whoop connect request');

    if (!config().clientId || !config().clientSecret) throw new Error('WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET not set');
    const { access_token, refresh_token, expires_in } = await tokenRequest({
      grant_type: 'authorization_code', code, redirect_uri: config().redirectUri,
    });

    let whoopUserId: string | null = null;
    try {
      const p = await axios.get(`${API}/v2/user/profile/basic`, { headers: { Authorization: `Bearer ${access_token}` } });
      whoopUserId = p.data?.user_id != null ? String(p.data.user_id) : null;
    } catch (err: any) {
      logger.warn('[Whoop] profile fetch failed (webhooks need user_id):', err.response?.data || err.message);
    }

    const { error } = await supabaseAdmin.from('athletes').update({
      whoop_access_token: access_token,
      whoop_refresh_token: refresh_token,
      whoop_token_expires_at: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
      whoop_user_id: whoopUserId,
      whoop_oauth_state: null, // one-time
    }).eq('id', athlete.id);
    if (error) throw new Error(`Failed to store Whoop tokens: ${error.message}`);

    logger.info(`[Whoop] connected athlete ${athlete.id} (whoop user ${whoopUserId})`);
    // History for trends (HRV baseline etc.) — don't block the redirect.
    void this.syncDays(athlete.id, WHOOP_BACKFILL_DAYS).catch((e) => logger.warn('[Whoop] backfill failed:', e?.message));
    return { athleteId: athlete.id, mobile: !!athlete.whoop_oauth_mobile };
  },

  async refreshToken(athleteId: string): Promise<string> {
    const existing = refreshInFlight.get(athleteId);
    if (existing) return existing;
    const p = (async () => {
      const { data: a } = await supabaseAdmin.from('athletes').select('whoop_refresh_token').eq('id', athleteId).single();
      if (!a?.whoop_refresh_token) throw new Error('Whoop not connected');
      try {
        const { access_token, refresh_token, expires_in } = await tokenRequest({
          grant_type: 'refresh_token', refresh_token: a.whoop_refresh_token, scope: 'offline',
        });
        await supabaseAdmin.from('athletes').update({
          whoop_access_token: access_token,
          whoop_refresh_token: refresh_token || a.whoop_refresh_token,
          whoop_token_expires_at: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
        }).eq('id', athleteId);
        return access_token as string;
      } catch (err: any) {
        logger.error(`[Whoop] token refresh failed for ${athleteId}:`, err.response?.data || err.message);
        throw new Error('Failed to refresh Whoop token');
      }
    })().finally(() => refreshInFlight.delete(athleteId));
    refreshInFlight.set(athleteId, p);
    return p;
  },

  async getAccessToken(athleteId: string): Promise<string | null> {
    const { data: a } = await supabaseAdmin
      .from('athletes').select('whoop_access_token, whoop_token_expires_at').eq('id', athleteId).single();
    if (!a?.whoop_access_token) return null;
    const expiresSoon = !a.whoop_token_expires_at || new Date(a.whoop_token_expires_at).getTime() < Date.now() + 5 * 60_000;
    return expiresSoon ? this.refreshToken(athleteId) : a.whoop_access_token;
  },

  /** Fetch every page of a v2 collection between two instants. */
  async fetchAll<T>(athleteId: string, path: string, startIso: string, endIso: string): Promise<T[]> {
    let token = await this.getAccessToken(athleteId);
    if (!token) return [];
    const out: T[] = [];
    let nextToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const params: Record<string, string> = { start: startIso, end: endIso, limit: '25' };
      if (nextToken) params.nextToken = nextToken;
      let resp;
      try {
        resp = await axios.get(`${API}${path}`, { params, headers: { Authorization: `Bearer ${token}` } });
      } catch (err: any) {
        if (err.response?.status === 401 && page === 0) { // token revoked/expired early → one refresh + retry
          token = await this.refreshToken(athleteId);
          resp = await axios.get(`${API}${path}`, { params, headers: { Authorization: `Bearer ${token}` } });
        } else throw err;
      }
      out.push(...(resp.data?.records || []));
      nextToken = resp.data?.next_token || undefined;
      if (!nextToken) break;
    }
    return out;
  },

  /**
   * Pull the last `days` days and write daily_metrics. Whoop is the top-priority
   * wellness source, so its fields always win; strain/other activities are
   * written without claiming wellness_source when there's no recovery/sleep.
   * Returns the dates written.
   */
  async syncDays(athleteId: string, days = 2): Promise<string[]> {
    const end = new Date();
    const start = new Date(end.getTime() - (days + 1) * 86_400_000);
    const [s, e] = [start.toISOString(), end.toISOString()];
    const [recoveries, sleeps, cycles, workouts] = await Promise.all([
      this.fetchAll<any>(athleteId, '/v2/recovery', s, e),
      this.fetchAll<any>(athleteId, '/v2/activity/sleep', s, e),
      this.fetchAll<any>(athleteId, '/v2/cycle', s, e),
      this.fetchAll<any>(athleteId, '/v2/activity/workout', s, e),
    ]);
    const daily = buildDailyWhoop({ recoveries, sleeps, cycles, workouts });
    const now = new Date().toISOString();

    // Was today's recovery already stored? (to notify only when it first lands)
    const { data: ath } = await supabaseAdmin.from('athletes').select('timezone').eq('id', athleteId).single();
    const today = todayInTimezone(ath?.timezone || 'America/Los_Angeles');
    const { data: before } = await supabaseAdmin
      .from('daily_metrics').select('wellness_source, readiness_score').eq('athlete_id', athleteId).eq('date', today).maybeSingle();
    const hadToday = before?.wellness_source === 'whoop' && before?.readiness_score != null;
    const written: string[] = [];
    for (const d of daily) {
      const row: Record<string, any> = { athlete_id: athleteId, date: d.date, ...d.fields };
      if (d.hasWellness) { row.wellness_source = 'whoop'; row.wellness_synced_at = now; }
      const { error } = await supabaseAdmin.from('daily_metrics').upsert(row, { onConflict: 'athlete_id,date' });
      if (error) logger.warn(`[Whoop] upsert ${d.date} failed for ${athleteId}: ${error.message}`);
      else written.push(d.date);
    }
    await supabaseAdmin.from('athletes').update({ whoop_last_sync_at: now }).eq('id', athleteId);
    logger.info(`[Whoop] synced ${written.length} day(s) for ${athleteId}`);

    const todayRow = daily.find((d) => d.date === today);
    if (!hadToday && todayRow?.fields.readiness_score != null && written.includes(today)) {
      void this.notifyRecovery(athleteId, today).catch((e) => logger.warn('[Whoop] recovery push failed:', e?.message));
    }
    return written;
  },

  /** Push today's recovery + the coach's call. Once per athlete per day (in-process guard). */
  async notifyRecovery(athleteId: string, today: string): Promise<void> {
    const key = `${athleteId}:${today}`;
    if (notifiedToday.has(key)) return;
    notifiedToday.add(key);
    const since = new Date(new Date(today + 'T12:00:00Z').getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: history }, { data: entries }] = await Promise.all([
      supabaseAdmin.from('daily_metrics')
        .select('date, wellness_source, readiness_score, hrv, rhr, sleep_seconds, sleep_need_seconds, sleep_debt_seconds, day_strain, recovery_calibrating, other_activities')
        .eq('athlete_id', athleteId).gte('date', since).order('date', { ascending: false }),
      supabaseAdmin.from('calendar_entries').select('workouts(name)')
        .eq('athlete_id', athleteId).eq('scheduled_date', today).not('workout_id', 'is', null).limit(1),
    ]);
    const todayRow = (history || []).find((d: any) => d.date === today);
    if (!todayRow || todayRow.readiness_score == null) return;
    const summary = summarizeWhoop(today, (history || []) as WellnessDay[]);
    const { title, body } = buildRecoveryPush({
      recovery: todayRow.readiness_score,
      summary,
      sleepSeconds: todayRow.sleep_seconds,
      sleepNeedSeconds: todayRow.sleep_need_seconds,
      workoutName: (entries?.[0] as any)?.workouts?.name ?? null,
    });
    await sendWhoopRecoveryNotification(athleteId, title, body);
  },

  /**
   * Pull today's data if Whoop is connected and hasn't synced recently (morning
   * card / chat backup to webhooks). Whoop only scores recovery after it detects
   * you've woken, so while TODAY is still missing we re-check every 5 minutes
   * instead of 30 — otherwise an early riser waits half an hour for their score.
   */
  async ensureFresh(athleteId: string, maxAgeMinutes = 30): Promise<void> {
    const { data: a } = await supabaseAdmin
      .from('athletes').select('whoop_access_token, whoop_last_sync_at, timezone').eq('id', athleteId).single();
    if (!a?.whoop_access_token) return;
    const today = todayInTimezone(a.timezone || 'America/Los_Angeles');
    const { data: row } = await supabaseAdmin
      .from('daily_metrics').select('wellness_source, readiness_score').eq('athlete_id', athleteId).eq('date', today).maybeSingle();
    const haveToday = row?.wellness_source === 'whoop' && row?.readiness_score != null;
    const maxAge = haveToday ? maxAgeMinutes : Math.min(maxAgeMinutes, 5);
    if (a.whoop_last_sync_at && Date.now() - new Date(a.whoop_last_sync_at).getTime() < maxAge * 60_000) return;
    await this.syncDays(athleteId, 2).catch((e) => logger.warn('[Whoop] ensureFresh failed:', e?.message));
  },

  /** Webhook event → re-pull the last couple of days for that Whoop user. */
  async handleWebhookEvent(event: { user_id?: number | string; type?: string; trace_id?: string }): Promise<void> {
    if (!event?.user_id || !event.type) return;
    // Logged so we can confirm Whoop notifies us instantly (vs. the 5-min backup pull).
    logger.info(`[Whoop] webhook ${event.type} for whoop user ${event.user_id} (trace ${event.trace_id || '-'})`);
    if (event.type.endsWith('.deleted')) {
      logger.info(`[Whoop] ${event.type} for user ${event.user_id} — resyncing recent days`);
    }
    const { data: a } = await supabaseAdmin
      .from('athletes').select('id').eq('whoop_user_id', String(event.user_id)).single();
    if (!a) { logger.warn(`[Whoop] webhook for unknown user ${event.user_id}`); return; }
    await this.syncDays(a.id, 2);
  },

  async isConnected(athleteId: string): Promise<boolean> {
    const { data: a } = await supabaseAdmin.from('athletes').select('whoop_access_token').eq('id', athleteId).single();
    return !!a?.whoop_access_token;
  },

  /** Revoke at Whoop (stops webhooks for this user) and clear tokens. Daily data is kept. */
  async disconnect(athleteId: string): Promise<void> {
    try {
      const token = await this.getAccessToken(athleteId);
      if (token) await axios.delete(`${API}/v2/user/access`, { headers: { Authorization: `Bearer ${token}` } });
    } catch (err: any) {
      logger.warn('[Whoop] revoke failed (clearing tokens anyway):', err.response?.data || err.message);
    }
    await supabaseAdmin.from('athletes').update({
      whoop_access_token: null, whoop_refresh_token: null, whoop_token_expires_at: null,
      whoop_user_id: null, whoop_oauth_state: null, whoop_last_sync_at: null,
    }).eq('id', athleteId);
  },

  /** Today in the athlete's timezone — exported for the morning-card path. */
  async todayFor(athleteId: string): Promise<string> {
    const { data: a } = await supabaseAdmin.from('athletes').select('timezone').eq('id', athleteId).single();
    return todayInTimezone(a?.timezone || 'America/Los_Angeles');
  },
};
