import { supabase } from '../config/supabase';

export interface HealthData {
  id: string;
  athlete_id: string;
  date: string;
  sleep_hours?: number;
  sleep_quality?: number; // 1-5 rating
  sleep_score?: number; // 0-100 from Garmin
  hrv?: number; // Heart rate variability in ms
  resting_heart_rate?: number; // Resting HR in bpm
  body_battery?: number; // 0-100 Garmin Body Battery
  readiness_score?: number; // 0-100 overall readiness
  stress_level?: number; // 1-5 subjective stress
  notes?: string;
  source?: string; // 'manual', 'garmin', 'whoop', 'oura', 'other'
  created_at: string;
  updated_at: string;
}

export const healthDataService = {
  /**
   * Get today's health data for the current user
   */
  async getTodaysHealthData(): Promise<HealthData | null> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return null; // No user, no data - that's okay
      }

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('health_data')
        .select('*')
        .eq('athlete_id', user.id)
        .eq('date', today)
        .single();

      if (error) {
        // Not found is okay - user may not have logged health data today
        if (error.code === 'PGRST116') {
          return null;
        }
        // Log other errors but don't throw - health data is optional
        console.warn('Failed to fetch health data:', error);
        return null;
      }

      return data;
    } catch (err) {
      // Catch any unexpected errors and return null - health data is optional
      console.warn('Error in getTodaysHealthData:', err);
      return null;
    }
  },

  /**
   * Get health data for a specific date
   */
  async getHealthDataForDate(date: string): Promise<HealthData | null> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('health_data')
      .select('*')
      .eq('athlete_id', user.id)
      .eq('date', date)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  },

  /**
   * Get health data for a date range
   */
  async getHealthDataRange(startDate: string, endDate: string): Promise<HealthData[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase
      .from('health_data')
      .select('*')
      .eq('athlete_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  },

  /**
   * Create or update health data for today
   */
  async saveHealthData(data: Partial<HealthData>): Promise<HealthData> {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const today = new Date().toISOString().split('T')[0];

    const { data: result, error } = await supabase
      .from('health_data')
      .upsert(
        {
          athlete_id: user.id,
          date: today,
          ...data,
        },
        {
          onConflict: 'athlete_id,date',
        }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return result;
  },
};
