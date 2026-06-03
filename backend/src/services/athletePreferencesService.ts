import { supabaseAdmin } from '../utils/supabase';

export interface AthletePreferences {
  workout_duration_preference?: string;
  preferred_workout_types?: string[];
  rest_days?: string[];
  training_goal?: string;
  event_date?: string;
  weekly_hours?: number;
  time_constraints?: string;
  /**
   * Per-day max training time in hours (0 = rest day). Keys are lowercase day
   * names. When this is set, the plan-builder uses it directly to size each
   * day's workout instead of guessing weekend = long. Example:
   *   { monday: 1, tuesday: 1.5, wednesday: 0, thursday: 1.5, friday: 0, saturday: 4, sunday: 2 }
   */
  daily_training_hours?: {
    monday?: number;
    tuesday?: number;
    wednesday?: number;
    thursday?: number;
    friday?: number;
    saturday?: number;
    sunday?: number;
  };
  indoor_outdoor?: 'indoor' | 'outdoor' | 'both';
  zwift_available?: boolean;
  intensity_preference?: string;
  ftp_test_preference?: 'test' | 'ai_estimation';
  learned_patterns?: {
    typical_workout_duration?: number;
    favorite_interval_type?: string;
    recovery_preference?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export class AthletePreferencesService {
  /**
   * Get athlete preferences
   */
  async getPreferences(athleteId: string): Promise<AthletePreferences> {
    const { data, error } = await supabaseAdmin
      .from('athletes')
      .select('preferences')
      .eq('id', athleteId)
      .single();

    if (error) {
      console.error('Error fetching athlete preferences:', error);
      return {};
    }

    return data?.preferences || {};
  }

  /**
   * Update athlete preferences (merge with existing)
   */
  async updatePreferences(
    athleteId: string,
    newPreferences: Partial<AthletePreferences>
  ): Promise<AthletePreferences> {
    // Get existing preferences
    const existing = await this.getPreferences(athleteId);

    // Deep merge preferences
    const updated = this.deepMerge(existing, newPreferences);

    // Update in database
    const { data, error } = await supabaseAdmin
      .from('athletes')
      .update({ preferences: updated })
      .eq('id', athleteId)
      .select('preferences')
      .single();

    if (error) {
      console.error('Error updating athlete preferences:', error);
      throw new Error('Failed to update preferences');
    }

    return data?.preferences || updated;
  }

  /**
   * Set a specific preference key
   */
  async setPreference(
    athleteId: string,
    key: string,
    value: any
  ): Promise<void> {
    await this.updatePreferences(athleteId, { [key]: value });
  }

  /**
   * Remove a preference key
   */
  async removePreference(athleteId: string, key: string): Promise<void> {
    const preferences = await this.getPreferences(athleteId);
    delete preferences[key];

    await supabaseAdmin
      .from('athletes')
      .update({ preferences })
      .eq('id', athleteId);
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }

    return output;
  }

  /**
   * Check if value is an object
   */
  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Format preferences for AI context
   */
  formatForContext(preferences: AthletePreferences): string {
    if (Object.keys(preferences).length === 0) {
      return 'No preferences set yet. Learn about the athlete through conversation.';
    }

    let formatted = 'Athlete Preferences (learned from previous conversations):\n';

    if (preferences.training_goal) {
      formatted += `\n**Training Goal:** ${preferences.training_goal}`;
    }

    if (preferences.event_date) {
      formatted += `\n**Target Event:** ${preferences.event_date}`;
    }

    if (preferences.weekly_hours) {
      formatted += `\n**Weekly Training Hours:** ${preferences.weekly_hours}`;
    }

    if (preferences.daily_training_hours) {
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
      const lines: string[] = [];
      let total = 0;
      for (const d of days) {
        const h = preferences.daily_training_hours[d];
        if (h == null) continue;
        const label = h === 0 ? 'rest' : `${h}h`;
        lines.push(`${d.charAt(0).toUpperCase() + d.slice(1)}: ${label}`);
        total += h;
      }
      if (lines.length > 0) {
        formatted += `\n**Per-Day Available Time** (use these for plan durations, do NOT assume weekend = long ride):\n  ${lines.join(', ')}\n  → Total: ${total} hr/week`;
      }
    }

    if (preferences.rest_days && preferences.rest_days.length > 0) {
      formatted += `\n**Rest Days:** ${preferences.rest_days.join(', ')}`;
    }

    if (preferences.workout_duration_preference) {
      formatted += `\n**Preferred Workout Duration:** ${preferences.workout_duration_preference}`;
    }

    if (preferences.preferred_workout_types && preferences.preferred_workout_types.length > 0) {
      formatted += `\n**Preferred Workout Types:** ${preferences.preferred_workout_types.join(', ')}`;
    }

    if (preferences.time_constraints) {
      formatted += `\n**Time Constraints:** ${preferences.time_constraints}`;
    }

    if (preferences.intensity_preference) {
      formatted += `\n**Intensity Preference:** ${preferences.intensity_preference}`;
    }

    if (preferences.ftp_test_preference) {
      formatted += `\n**FTP Testing:** ${preferences.ftp_test_preference === 'ai_estimation' ? 'Prefers AI estimation (no physical tests)' : 'Prefers regular FTP tests'}`;
    }

    if (preferences.indoor_outdoor) {
      formatted += `\n**Indoor/Outdoor:** ${preferences.indoor_outdoor}`;
    }

    if (preferences.zwift_available !== undefined) {
      formatted += `\n**Zwift Available:** ${preferences.zwift_available ? 'Yes' : 'No'}`;
    }

    if (preferences.learned_patterns) {
      formatted += '\n\n**Learned Patterns:**';
      if (preferences.learned_patterns.typical_workout_duration) {
        formatted += `\n- Typical workout duration: ${preferences.learned_patterns.typical_workout_duration} minutes`;
      }
      if (preferences.learned_patterns.favorite_interval_type) {
        formatted += `\n- Favorite interval type: ${preferences.learned_patterns.favorite_interval_type}`;
      }
      if (preferences.learned_patterns.recovery_preference) {
        formatted += `\n- Recovery preference: ${preferences.learned_patterns.recovery_preference}`;
      }
    }

    return formatted;
  }
}

export const athletePreferencesService = new AthletePreferencesService();
