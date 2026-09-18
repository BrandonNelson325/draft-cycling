import { api } from './api';

export interface PlannedWorkoutInfo {
  calendarEntryId: string;
  workoutId: string;
  workoutName: string;
  workoutType: string;
  plannedTSS: number | null;
  plannedDuration: number;
  description?: string;
}

export interface IntervalAnalysis {
  hasIntervals: boolean;
  reason?: string;
  ftp?: number;
  structure_label?: string;
  rep_count?: number;
  reps?: Array<{
    rep: number; lap_index: number; duration_s: number;
    avg_watts: number | null; pct_ftp: number | null; avg_hr: number | null; avg_cadence: number | null;
  }>;
  summary?: {
    avg_power: number | null; avg_pct_ftp: number | null; avg_hr: number | null;
    avg_cadence: number | null; avg_duration_s: number; fade_pct: number | null;
    strongest_rep: number; weakest_rep: number; consistency_cv_pct: number | null;
    hr_drift_bpm: number | null; avg_recovery_power: number | null;
  };
}

export interface UnacknowledgedActivity {
  id: string;
  name: string;
  start_date: string;
  strava_activity_id: number;
  distance_meters: number | null;
  moving_time_seconds: number | null;
  average_watts: number | null;
  normalized_power: number | null;
  intensity_factor: number | null;
  best_5min_power: number | null;
  best_20min_power: number | null;
  tss: number | null;
  average_heartrate: number | null;
  calories: number | null;
  plannedWorkout: PlannedWorkoutInfo | null;
  matchConfidence: 'high' | 'partial' | 'low' | null;
  intervalAnalysis: IntervalAnalysis | null;
}

export interface ActivityFeedback {
  perceived_effort?: number;
  notes?: string;
  was_planned_workout?: boolean;
  calendar_entry_id?: string;
}

/**
 * One-glance debrief text for a structured interval ride. Pure — safe in render.
 * Returns null when the ride wasn't an interval session.
 */
export function describeIntervalDebrief(
  ia: IntervalAnalysis | null | undefined
): { headline: string; verdict: string } | null {
  if (!ia?.hasIntervals || !ia.summary) return null;
  const s = ia.summary;
  const power = s.avg_pct_ftp != null ? `avg ${s.avg_pct_ftp}% FTP` : s.avg_power != null ? `avg ${s.avg_power}W` : '';
  const headline = [ia.structure_label, power].filter(Boolean).join(' · ');

  const fade = s.fade_pct;
  let verdict: string;
  if (fade == null) {
    verdict = `${ia.rep_count} reps recorded.`;
  } else if (fade >= -1.5 && fade <= 1.5) {
    verdict = `Rock-solid — held power across all ${ia.rep_count} reps.`;
  } else if (fade < -1.5) {
    verdict = `Negative split — you got stronger (rep ${s.strongest_rep} best).`;
  } else if (fade <= 5) {
    verdict = `Well paced — slight ${fade}% fade.`;
  } else {
    verdict = `Faded ${fade}% (rep ${s.strongest_rep}→${s.weakest_rep}) — started a bit hot.`;
  }
  if (s.hr_drift_bpm != null && s.hr_drift_bpm >= 8) verdict += ` HR drifted +${s.hr_drift_bpm} bpm.`;
  return { headline, verdict };
}

/**
 * One-glance summary for a NON-interval ride (race, free ride, endurance) so
 * every meaningful ride gets a post-ride debrief. Pure. Returns null when
 * there's nothing worth summarizing.
 */
export function describeRideSummary(a: {
  intensity_factor: number | null;
  tss: number | null;
  best_5min_power: number | null;
  best_20min_power: number | null;
  average_watts: number | null;
}): { headline: string; detail: string | null } | null {
  const hasSomething = a.intensity_factor != null || a.tss != null || a.average_watts != null;
  if (!hasSomething) return null;

  const if_ = a.intensity_factor;
  let label = 'Ride';
  if (if_ != null) {
    label = if_ >= 1.05 ? 'Very hard ride' : if_ >= 0.95 ? 'Hard ride' : if_ >= 0.85 ? 'Solid ride' : if_ >= 0.75 ? 'Moderate ride' : 'Easy ride';
  }
  const parts = [label];
  if (if_ != null) parts.push(`IF ${if_.toFixed(2)}`);
  if (a.tss != null) parts.push(`${Math.round(a.tss)} TSS`);
  const headline = parts.join(' · ');

  let detail: string | null = null;
  if (a.best_5min_power != null || a.best_20min_power != null) {
    const bits: string[] = [];
    if (a.best_5min_power != null) bits.push(`best 5-min ${Math.round(a.best_5min_power)}W`);
    if (a.best_20min_power != null) bits.push(`20-min ${Math.round(a.best_20min_power)}W`);
    detail = bits.join(' · ');
  } else if (a.average_watts != null) {
    detail = `avg ${Math.round(a.average_watts)}W`;
  }
  return { headline, detail };
}

export const activityFeedbackService = {
  async getUnacknowledged(): Promise<UnacknowledgedActivity[]> {
    const { data, error } = await api.get<{ activities: UnacknowledgedActivity[] }>(
      '/api/activities/unacknowledged',
      true
    );

    if (error || !data) {
      throw new Error(error?.error || 'Failed to get unacknowledged activities');
    }

    return data.activities;
  },

  async acknowledge(activityId: string, feedback: ActivityFeedback): Promise<void> {
    const { error } = await api.post(
      `/api/activities/${activityId}/acknowledge`,
      feedback,
      true
    );

    if (error) {
      throw new Error(error.error || 'Failed to acknowledge activity');
    }
  },
};
