/**
 * Training Load Calculations
 *
 * TSS (Training Stress Score) = (duration_seconds * NP * IF) / (FTP * 3600) * 100
 * Where:
 * - NP = Normalized Power (from Strava's weighted_average_watts, falls back to average power)
 * - IF = Intensity Factor = NP / FTP
 *
 * CTL (Chronic Training Load / Fitness) = Exponentially weighted average of last 42 days TSS
 * ATL (Acute Training Load / Fatigue) = Exponentially weighted average of last 7 days TSS
 * TSB (Training Stress Balance / Form) = CTL - ATL
 */

interface Activity {
  start_date: string;
  moving_time_seconds?: number;
  average_watts?: number;
  tss?: number;
}

/**
 * Calculate TSS from power data
 * Uses Normalized Power (NP) when available for accurate variable-power TSS.
 * Falls back to average power when NP is not provided.
 */
export function calculateTSS(
  durationSeconds: number,
  averageWatts: number,
  ftp: number,
  normalizedPower?: number
): number {
  if (!durationSeconds || !averageWatts || !ftp || ftp === 0) {
    return 0;
  }

  // Use Normalized Power when available, fall back to average power
  const np = normalizedPower && normalizedPower > 0 ? normalizedPower : averageWatts;
  const intensityFactor = np / ftp;
  const tss = (durationSeconds * np * intensityFactor) / (ftp * 3600) * 100;

  return Math.round(tss * 10) / 10; // Round to 1 decimal
}

/**
 * Calculate CTL (Chronic Training Load) using exponential weighted moving average
 * Time constant = 42 days
 */
export function calculateCTL(activities: Activity[], targetDate: Date): number {
  const timeConstant = 42;
  const sortedActivities = activities
    .filter(a => new Date(a.start_date) <= targetDate)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  if (sortedActivities.length === 0) return 0;

  let ctl = 0;
  let previousDate = new Date(sortedActivities[0].start_date);

  for (const activity of sortedActivities) {
    const activityDate = new Date(activity.start_date);
    const daysDiff = Math.max(
      1,
      Math.floor((activityDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Apply decay for days without activities
    for (let i = 0; i < daysDiff; i++) {
      ctl = ctl + (0 - ctl) / timeConstant;
    }

    // Add today's TSS
    const tss = activity.tss || 0;
    ctl = ctl + (tss - ctl) / timeConstant;

    previousDate = activityDate;
  }

  // Decay to target date if needed
  const daysSinceLastActivity = Math.floor(
    (targetDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  for (let i = 0; i < daysSinceLastActivity; i++) {
    ctl = ctl + (0 - ctl) / timeConstant;
  }

  return Math.round(ctl * 10) / 10;
}

/**
 * Calculate ATL (Acute Training Load) using exponential weighted moving average
 * Time constant = 7 days
 */
export function calculateATL(activities: Activity[], targetDate: Date): number {
  const timeConstant = 7;
  const sortedActivities = activities
    .filter(a => new Date(a.start_date) <= targetDate)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  if (sortedActivities.length === 0) return 0;

  let atl = 0;
  let previousDate = new Date(sortedActivities[0].start_date);

  for (const activity of sortedActivities) {
    const activityDate = new Date(activity.start_date);
    const daysDiff = Math.max(
      1,
      Math.floor((activityDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    // Apply decay for days without activities
    for (let i = 0; i < daysDiff; i++) {
      atl = atl + (0 - atl) / timeConstant;
    }

    // Add today's TSS
    const tss = activity.tss || 0;
    atl = atl + (tss - atl) / timeConstant;

    previousDate = activityDate;
  }

  // Decay to target date if needed
  const daysSinceLastActivity = Math.floor(
    (targetDate.getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  for (let i = 0; i < daysSinceLastActivity; i++) {
    atl = atl + (0 - atl) / timeConstant;
  }

  return Math.round(atl * 10) / 10;
}

/**
 * Calculate TSB (Training Stress Balance)
 */
export function calculateTSB(ctl: number, atl: number): number {
  return Math.round((ctl - atl) * 10) / 10;
}

/**
 * Get form status based on TSB
 */
export function getFormStatus(tsb: number): string {
  if (tsb < -30) return 'Overreaching - High Fatigue';
  if (tsb < -20) return 'Heavy Training - Tired';
  if (tsb < -10) return 'Productive Training';
  if (tsb < 5) return 'Neutral / Maintaining';
  if (tsb < 15) return 'Freshening - Good Form';
  if (tsb < 25) return 'Fresh - Race Ready';
  return 'Very Fresh - Detraining Risk';
}

/**
 * Estimate FTP from power data
 * Uses best 20-minute and 60-minute power efforts
 */
export function estimateFTP(activities: Activity[]): {
  estimated_ftp: number;
  confidence: number;
  based_on_rides: number;
} | null {
  // Filter activities with power data
  const powerActivities = activities.filter(
    a => a.average_watts && a.average_watts > 100 && a.moving_time_seconds && a.moving_time_seconds > 1200
  );

  if (powerActivities.length < 3) {
    return null; // Not enough data
  }

  // Find best sustained efforts
  const efforts = powerActivities.map(a => ({
    duration: a.moving_time_seconds!,
    avgPower: a.average_watts!,
  }));

  // Best 20-minute power (scaled to FTP)
  const twentyMinEfforts = efforts.filter(e => e.duration >= 1200 && e.duration <= 2400);
  const best20Min = twentyMinEfforts.length > 0
    ? Math.max(...twentyMinEfforts.map(e => e.avgPower)) * 0.95
    : 0;

  // Best 60-minute power (approximately FTP)
  const sixtyMinEfforts = efforts.filter(e => e.duration >= 3000 && e.duration <= 4800);
  const best60Min = sixtyMinEfforts.length > 0
    ? Math.max(...sixtyMinEfforts.map(e => e.avgPower))
    : 0;

  // Use best estimate available
  let estimatedFTP = 0;
  let confidence = 0;

  if (best60Min > 0) {
    estimatedFTP = Math.round(best60Min);
    confidence = 0.9; // High confidence from 60-min power
  } else if (best20Min > 0) {
    estimatedFTP = Math.round(best20Min);
    confidence = 0.7; // Medium confidence from 20-min power
  } else {
    // Fallback: use 75% of best average power
    const bestAvg = Math.max(...efforts.map(e => e.avgPower));
    estimatedFTP = Math.round(bestAvg * 0.75);
    confidence = 0.5; // Low confidence
  }

  // Adjust confidence based on data quantity
  const dataQualityFactor = Math.min(powerActivities.length / 10, 1);
  confidence = confidence * dataQualityFactor;

  return {
    estimated_ftp: estimatedFTP,
    confidence: Math.round(confidence * 100) / 100,
    based_on_rides: powerActivities.length,
  };
}
