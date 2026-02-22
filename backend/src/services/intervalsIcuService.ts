import axios from 'axios';
import { supabaseAdmin } from '../utils/supabase';
import { zwoGenerator } from './fileGenerators/zwoGenerator';
import { logger } from '../utils/logger';

const INTERVALS_ICU_BASE_URL = 'https://intervals.icu/api/v1';
const INTERVALS_ICU_OAUTH_URL = 'https://intervals.icu/oauth';

interface IntervalsIcuConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

class IntervalsIcuService {
  private config: IntervalsIcuConfig;

  constructor() {
    this.config = {
      clientId: process.env.INTERVALS_ICU_CLIENT_ID || '',
      clientSecret: process.env.INTERVALS_ICU_CLIENT_SECRET || '',
      redirectUri: process.env.INTERVALS_ICU_REDIRECT_URI || 'http://localhost:3001/api/integrations/intervals-icu/callback',
    };
  }

  /**
   * Get OAuth authorization URL
   */
  getAuthUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: 'CALENDAR:WRITE,ACTIVITY:READ',
      state: state || '',
    });

    return `${INTERVALS_ICU_OAUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async handleCallback(code: string, athleteId: string): Promise<void> {
    try {
      const response = await axios.post(
        `${INTERVALS_ICU_OAUTH_URL}/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, expires_in, athlete } = response.data;

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      // Store tokens in database
      const { error } = await supabaseAdmin
        .from('athletes')
        .update({
          intervals_icu_access_token: access_token,
          intervals_icu_refresh_token: refresh_token,
          intervals_icu_token_expires_at: expiresAt.toISOString(),
          intervals_icu_athlete_id: athlete?.id?.toString(),
          intervals_icu_auto_sync: true,
        })
        .eq('id', athleteId);

      if (error) {
        throw new Error(`Failed to store Intervals.icu tokens: ${error.message}`);
      }

      logger.debug(`✅ Intervals.icu connected for athlete ${athleteId}`);
    } catch (error: any) {
      logger.error('Intervals.icu OAuth callback error:', error.response?.data || error.message);
      throw new Error('Failed to connect Intervals.icu account');
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('intervals_icu_refresh_token')
      .eq('id', athleteId)
      .single();

    if (!athlete?.intervals_icu_refresh_token) {
      throw new Error('No Intervals.icu refresh token found');
    }

    try {
      const response = await axios.post(
        `${INTERVALS_ICU_OAUTH_URL}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: athlete.intervals_icu_refresh_token,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      // Update tokens
      await supabaseAdmin
        .from('athletes')
        .update({
          intervals_icu_access_token: access_token,
          intervals_icu_refresh_token: refresh_token || athlete.intervals_icu_refresh_token,
          intervals_icu_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', athleteId);

      return access_token;
    } catch (error: any) {
      logger.error('Token refresh failed:', error.response?.data || error.message);
      throw new Error('Failed to refresh Intervals.icu token');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('intervals_icu_access_token, intervals_icu_token_expires_at')
      .eq('id', athleteId)
      .single();

    if (!athlete?.intervals_icu_access_token) {
      throw new Error('Intervals.icu not connected');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    const expiresAt = new Date(athlete.intervals_icu_token_expires_at);
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      return await this.refreshToken(athleteId);
    }

    return athlete.intervals_icu_access_token;
  }

  /**
   * Upload workout to Intervals.icu
   */
  async uploadWorkout(
    athleteId: string,
    workoutId: string,
    scheduledDate: Date,
    calendarEntryId?: string
  ): Promise<string> {
    try {
      // Get athlete data
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp, intervals_icu_athlete_id')
        .eq('id', athleteId)
        .single();

      if (!athlete?.ftp) {
        throw new Error('Athlete FTP not set');
      }

      // Get workout data
      const { data: workout } = await supabaseAdmin
        .from('workouts')
        .select('*')
        .eq('id', workoutId)
        .single();

      if (!workout) {
        throw new Error('Workout not found');
      }

      // Generate .zwo file content
      const zwoContent = zwoGenerator.generate(workout, athlete.ftp);

      // Convert to base64
      const base64Content = Buffer.from(zwoContent).toString('base64');

      // Get access token
      const accessToken = await this.getAccessToken(athleteId);

      // Format date for Intervals.icu (ISO 8601 local time)
      const dateStr = scheduledDate.toISOString().split('T')[0] + 'T00:00:00';

      // Upload to Intervals.icu
      const response = await axios.post(
        `${INTERVALS_ICU_BASE_URL}/athlete/0/events/bulk?upsert=true`,
        [
          {
            category: 'WORKOUT',
            start_date_local: dateStr,
            type: 'Ride',
            name: workout.name,
            description: workout.description || '',
            filename: `${workout.name.replace(/\s+/g, '_')}.zwo`,
            file_contents_base64: base64Content,
            external_id: workoutId, // Use our workout ID to prevent duplicates
          },
        ],
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const eventId = response.data[0]?.id;

      // Store sync record
      await supabaseAdmin.from('workout_syncs').upsert({
        workout_id: workoutId,
        athlete_id: athleteId,
        calendar_entry_id: calendarEntryId || null,
        integration: 'intervals_icu',
        external_id: eventId?.toString(),
        external_url: `https://intervals.icu/athlete/${athlete.intervals_icu_athlete_id}/calendar?date=${scheduledDate.toISOString().split('T')[0]}`,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      });

      logger.debug(`✅ Workout synced to Intervals.icu: ${workout.name}`);
      return eventId;
    } catch (error: any) {
      logger.error('Failed to upload workout to Intervals.icu:', error.response?.data || error.message);

      // Store failed sync
      await supabaseAdmin.from('workout_syncs').upsert({
        workout_id: workoutId,
        athlete_id: athleteId,
        calendar_entry_id: calendarEntryId || null,
        integration: 'intervals_icu',
        sync_status: 'failed',
        sync_error: error.message,
        last_synced_at: new Date().toISOString(),
      });

      throw new Error('Failed to sync workout to Intervals.icu');
    }
  }

  /**
   * Delete workout from Intervals.icu
   */
  async deleteWorkout(athleteId: string, externalId: string): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(athleteId);

      await axios.delete(`${INTERVALS_ICU_BASE_URL}/athlete/0/events/${externalId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      logger.debug(`✅ Workout deleted from Intervals.icu: ${externalId}`);
    } catch (error: any) {
      logger.error('Failed to delete workout from Intervals.icu:', error.response?.data || error.message);
      throw new Error('Failed to delete workout from Intervals.icu');
    }
  }

  /**
   * Disconnect Intervals.icu
   */
  async disconnect(athleteId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({
        intervals_icu_access_token: null,
        intervals_icu_refresh_token: null,
        intervals_icu_token_expires_at: null,
        intervals_icu_athlete_id: null,
        intervals_icu_auto_sync: false,
      })
      .eq('id', athleteId);

    if (error) {
      throw new Error(`Failed to disconnect Intervals.icu: ${error.message}`);
    }
  }

  /**
   * Check if athlete has Intervals.icu connected
   */
  async isConnected(athleteId: string): Promise<boolean> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('intervals_icu_access_token')
      .eq('id', athleteId)
      .single();

    return !!athlete?.intervals_icu_access_token;
  }
}

export const intervalsIcuService = new IntervalsIcuService();
