import axios from 'axios';
import { supabaseAdmin } from '../utils/supabase';
import { generateWahooPlan } from './wahooPlanGenerator';
import { logger } from '../utils/logger';

const WAHOO_API_URL = 'https://api.wahooligan.com/v1';
const WAHOO_OAUTH_URL = 'https://api.wahooligan.com/oauth';

interface WahooConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  mobileRedirectUri: string;
}

class WahooService {
  private config: WahooConfig;

  constructor() {
    this.config = {
      clientId: process.env.WAHOO_CLIENT_ID || '',
      clientSecret: process.env.WAHOO_CLIENT_SECRET || '',
      redirectUri: process.env.WAHOO_REDIRECT_URI || 'http://localhost:3001/api/integrations/wahoo/callback',
      mobileRedirectUri: process.env.WAHOO_MOBILE_REDIRECT_URI || 'cyclingcoach://wahoo/callback',
    };
  }

  getAuthUrl(state?: string, mobile?: boolean): string {
    const fullState = mobile ? `${state || ''}:mobile` : (state || '');
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: 'workouts_write plans_write user_read',
      state: fullState,
    });
    return `${WAHOO_OAUTH_URL}/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, athleteId: string): Promise<void> {
    try {
      const response = await axios.post(
        `${WAHOO_OAUTH_URL}/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      let wahooUserId: string | null = null;
      try {
        const userResp = await axios.get(`${WAHOO_API_URL}/user`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        wahooUserId = userResp.data?.id?.toString() || null;
      } catch {
        logger.warn('Could not fetch Wahoo user profile, proceeding without user ID');
      }

      const { error } = await supabaseAdmin
        .from('athletes')
        .update({
          wahoo_access_token: access_token,
          wahoo_refresh_token: refresh_token,
          wahoo_token_expires_at: expiresAt.toISOString(),
          wahoo_user_id: wahooUserId,
          wahoo_auto_sync: true,
        })
        .eq('id', athleteId);

      if (error) throw new Error(`Failed to store Wahoo tokens: ${error.message}`);
      logger.info(`Wahoo connected for athlete ${athleteId}`);
    } catch (error: any) {
      logger.error('Wahoo OAuth callback error:', error.response?.data || error.message);
      throw new Error('Failed to connect Wahoo account');
    }
  }

  async refreshToken(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_refresh_token')
      .eq('id', athleteId)
      .single();

    if (!athlete?.wahoo_refresh_token) throw new Error('No Wahoo refresh token found');

    try {
      const response = await axios.post(
        `${WAHOO_OAUTH_URL}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: athlete.wahoo_refresh_token,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      await supabaseAdmin
        .from('athletes')
        .update({
          wahoo_access_token: access_token,
          wahoo_refresh_token: refresh_token || athlete.wahoo_refresh_token,
          wahoo_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', athleteId);

      return access_token;
    } catch (error: any) {
      logger.error('Wahoo token refresh failed:', error.response?.data || error.message);
      throw new Error('Failed to refresh Wahoo token');
    }
  }

  async getAccessToken(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_access_token, wahoo_token_expires_at')
      .eq('id', athleteId)
      .single();

    if (!athlete?.wahoo_access_token) throw new Error('Wahoo not connected');

    const expiresAt = new Date(athlete.wahoo_token_expires_at);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) return await this.refreshToken(athleteId);
    return athlete.wahoo_access_token;
  }

  async uploadWorkout(
    athleteId: string,
    workoutId: string,
    scheduledDate: Date,
    calendarEntryId?: string
  ): Promise<string> {
    try {
      const { data: athlete } = await supabaseAdmin
        .from('athletes').select('ftp').eq('id', athleteId).single();
      if (!athlete?.ftp) throw new Error('Athlete FTP not set');

      const { data: workout } = await supabaseAdmin
        .from('workouts').select('*').eq('id', workoutId).single();
      if (!workout) throw new Error('Workout not found');

      const planContent = generateWahooPlan(workout, athlete.ftp);
      const base64Plan = Buffer.from(planContent).toString('base64');
      const accessToken = await this.getAccessToken(athleteId);

      // Step 1: Create plan
      const planResponse = await axios.post(
        `${WAHOO_API_URL}/plans`,
        new URLSearchParams({
          'plan[file]': `data:application/json;base64,${base64Plan}`,
          'plan[filename]': `${workout.name.replace(/\s+/g, '_')}.plan`,
          'plan[external_id]': workoutId,
          'plan[provider_updated_at]': new Date().toISOString(),
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      const planId = planResponse.data?.id;

      // Step 2: Create workout (scheduled instance)
      const workoutResponse = await axios.post(
        `${WAHOO_API_URL}/workouts`,
        new URLSearchParams({
          'workout[name]': workout.name,
          'workout[workout_type_id]': '40',
          'workout[starts]': scheduledDate.toISOString(),
          'workout[minutes]': workout.duration_minutes.toString(),
          'workout[plan_id]': planId?.toString() || '',
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
      const wahooWorkoutId = workoutResponse.data?.id;

      await supabaseAdmin.from('workout_syncs').upsert({
        workout_id: workoutId,
        athlete_id: athleteId,
        calendar_entry_id: calendarEntryId || null,
        integration: 'wahoo',
        external_id: wahooWorkoutId?.toString() || planId?.toString(),
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      });

      logger.info(`Workout synced to Wahoo: ${workout.name}`);
      return wahooWorkoutId || planId;
    } catch (error: any) {
      logger.error('Failed to upload workout to Wahoo:', error.response?.data || error.message);
      await supabaseAdmin.from('workout_syncs').upsert({
        workout_id: workoutId,
        athlete_id: athleteId,
        calendar_entry_id: calendarEntryId || null,
        integration: 'wahoo',
        sync_status: 'failed',
        sync_error: error.response?.data?.error || error.message,
        last_synced_at: new Date().toISOString(),
      });
      throw new Error('Failed to sync workout to Wahoo');
    }
  }

  async deleteWorkout(athleteId: string, externalId: string): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(athleteId);
      await axios.delete(`${WAHOO_API_URL}/workouts/${externalId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await supabaseAdmin
        .from('workout_syncs')
        .update({ sync_status: 'deleted', last_synced_at: new Date().toISOString() })
        .eq('external_id', externalId)
        .eq('integration', 'wahoo')
        .eq('athlete_id', athleteId);
      logger.info(`Workout deleted from Wahoo: ${externalId}`);
    } catch (error: any) {
      logger.error('Failed to delete workout from Wahoo:', error.response?.data || error.message);
      throw new Error('Failed to delete workout from Wahoo');
    }
  }

  async disconnect(athleteId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({
        wahoo_access_token: null,
        wahoo_refresh_token: null,
        wahoo_token_expires_at: null,
        wahoo_user_id: null,
        wahoo_auto_sync: false,
      })
      .eq('id', athleteId);
    if (error) throw new Error(`Failed to disconnect Wahoo: ${error.message}`);
  }

  async isConnected(athleteId: string): Promise<boolean> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_access_token')
      .eq('id', athleteId)
      .single();
    return !!athlete?.wahoo_access_token;
  }
}

export const wahooService = new WahooService();
