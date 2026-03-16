import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';
import { utcToLocalDate, mondayOfWeek, todayInTimezone } from '../utils/timezone';

export interface RampRate {
  percentage: number;
  status: 'conservative' | 'moderate' | 'aggressive' | 'dangerous';
  weeklyTSS: number[]; // last N complete weeks, oldest first
  currentPartialWeekTSS: number;
}

export interface VolumeProfile {
  avgRideDaysPerWeek: number;
  avgHoursPerWeek: number;
  avgTSSPerWeek: number;
  avgTSSPerRide: number;
  pattern: 'high-frequency-moderate' | 'low-frequency-intense' | 'balanced';
  description: string;
}

export interface HardEasyPattern {
  hardDays: number;
  easyDays: number;
  restDays: number;
  backToBackHardDays: number;
  easyDayCompliance: number; // 0-1
  pattern: 'polarized' | 'mostly-hard' | 'mostly-easy' | 'chaotic';
}

export interface FatigueProfile {
  rampRate: RampRate | null;
  volumeProfile: VolumeProfile | null;
  hardEasyPattern: HardEasyPattern | null;
}

function getWeekKey(utcDateStr: string, tz: string): string {
  // Use athlete's local date to determine which Monday-based week this falls in
  const localDate = utcToLocalDate(utcDateStr, tz);
  return mondayOfWeek(localDate); // Returns "YYYY-MM-DD" of Monday
}

function getCurrentWeekKey(tz: string): string {
  const today = todayInTimezone(tz);
  return mondayOfWeek(today);
}

function computeRampRate(activities: any[], tz: string): RampRate | null {
  // Group by week using athlete's local timezone
  const weeklyTSS = new Map<string, number>();
  for (const a of activities) {
    const weekKey = getWeekKey(a.start_date, tz);
    weeklyTSS.set(weekKey, (weeklyTSS.get(weekKey) || 0) + (a.tss || 0));
  }

  // Sort weeks chronologically
  const sortedWeeks = Array.from(weeklyTSS.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const currentWeekKey = getCurrentWeekKey(tz);
  // Separate current partial week from complete weeks
  const completeWeeks = sortedWeeks.filter(([key]) => key !== currentWeekKey);
  const currentPartialWeekTSS = weeklyTSS.get(currentWeekKey) || 0;

  if (completeWeeks.length < 2) return null;

  const weekValues = completeWeeks.map(([, tss]) => tss);
  const lastWeek = weekValues[weekValues.length - 1];
  const prevWeek = weekValues[weekValues.length - 2];

  let percentage = 0;
  if (prevWeek > 0) {
    percentage = ((lastWeek - prevWeek) / prevWeek) * 100;
  }

  let status: RampRate['status'];
  const absPercentage = Math.abs(percentage);
  if (percentage <= 5) status = 'conservative';
  else if (absPercentage <= 10) status = 'moderate';
  else if (absPercentage <= 15) status = 'aggressive';
  else status = 'dangerous';

  // Only flag increasing ramp as aggressive/dangerous
  if (percentage < 0) status = 'conservative';

  return {
    percentage: Math.round(percentage * 10) / 10,
    status,
    weeklyTSS: weekValues,
    currentPartialWeekTSS: Math.round(currentPartialWeekTSS),
  };
}

function computeVolumeProfile(activities: any[], tz: string = 'America/Los_Angeles'): VolumeProfile | null {
  if (activities.length === 0) return null;

  // Use last 6 weeks of data
  const sixWeeksAgo = new Date();
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);

  const recentActivities = activities.filter((a) => {
    const date = new Date(a.start_date);
    return date >= sixWeeksAgo;
  });

  if (recentActivities.length === 0) return null;

  // Count unique ride days (using athlete's local timezone)
  const rideDays = new Set<string>();
  let totalHours = 0;
  let totalTSS = 0;

  for (const a of recentActivities) {
    const dateStr = utcToLocalDate(a.start_date, tz);
    rideDays.add(dateStr);
    totalHours += (a.moving_time_seconds || 0) / 3600;
    totalTSS += a.tss || 0;
  }

  const weeks = 6;
  const avgRideDaysPerWeek = Math.round((rideDays.size / weeks) * 10) / 10;
  const avgHoursPerWeek = Math.round((totalHours / weeks) * 10) / 10;
  const avgTSSPerWeek = Math.round(totalTSS / weeks);
  const avgTSSPerRide = recentActivities.length > 0 ? Math.round(totalTSS / recentActivities.length) : 0;

  let pattern: VolumeProfile['pattern'];
  if (avgRideDaysPerWeek >= 5 && avgTSSPerRide < 70) {
    pattern = 'high-frequency-moderate';
  } else if (avgRideDaysPerWeek <= 3 && avgTSSPerRide > 90) {
    pattern = 'low-frequency-intense';
  } else {
    pattern = 'balanced';
  }

  const description = `Rides ${avgRideDaysPerWeek} days/week, ${avgHoursPerWeek} hrs, ${avgTSSPerWeek} TSS/week`;

  return { avgRideDaysPerWeek, avgHoursPerWeek, avgTSSPerWeek, avgTSSPerRide, pattern, description };
}

function computeHardEasyPattern(activities: any[], ftp: number | null, tz: string): HardEasyPattern | null {
  if (!ftp || ftp === 0) return null;

  // Build a day-by-day map for the last 14 days
  const todayStr = todayInTimezone(tz);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  const dayMap = new Map<string, { tss: number; avgWatts: number }>();

  for (const a of activities) {
    const dateStr = utcToLocalDate(a.start_date, tz);
    const [dy, dm, dd] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(dy, dm - 1, dd, 12, 0, 0));
    const daysAgo = Math.round((today.getTime() - date.getTime()) / 86400000);
    if (daysAgo < 0 || daysAgo > 13) continue;

    const existing = dayMap.get(dateStr) || { tss: 0, avgWatts: 0 };
    // For multi-ride days, sum TSS and take max avg watts
    existing.tss += a.tss || 0;
    existing.avgWatts = Math.max(existing.avgWatts, a.average_watts || 0);
    dayMap.set(dateStr, existing);
  }

  const hardThresholdWatts = ftp * 0.76;
  let hardDays = 0;
  let easyDays = 0;
  let restDays = 0;
  let backToBackHardDays = 0;
  let postHardDaysEasyOrRest = 0;
  let totalPostHardDays = 0;

  // Classify each of the last 14 days
  type DayType = 'hard' | 'easy' | 'rest';
  const dayTypes: DayType[] = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayData = dayMap.get(dateStr);

    if (!dayData) {
      restDays++;
      dayTypes.push('rest');
    } else if (dayData.tss >= 80 || dayData.avgWatts >= hardThresholdWatts) {
      hardDays++;
      dayTypes.push('hard');
    } else {
      easyDays++;
      dayTypes.push('easy');
    }
  }

  // Count back-to-back hard days and easy-day compliance
  for (let i = 1; i < dayTypes.length; i++) {
    if (dayTypes[i] === 'hard' && dayTypes[i - 1] === 'hard') {
      backToBackHardDays++;
    }
    if (dayTypes[i - 1] === 'hard' && i < dayTypes.length) {
      totalPostHardDays++;
      if (dayTypes[i] === 'easy' || dayTypes[i] === 'rest') {
        postHardDaysEasyOrRest++;
      }
    }
  }

  const easyDayCompliance = totalPostHardDays > 0
    ? Math.round((postHardDaysEasyOrRest / totalPostHardDays) * 100) / 100
    : 1;

  const totalDaysWithRides = hardDays + easyDays;
  const hardPercent = totalDaysWithRides > 0 ? hardDays / 14 : 0;

  let pattern: HardEasyPattern['pattern'];
  if (easyDayCompliance >= 0.75) {
    pattern = 'polarized';
  } else if (hardPercent > 0.6) {
    pattern = 'mostly-hard';
  } else if (hardPercent < 0.2) {
    pattern = 'mostly-easy';
  } else {
    pattern = 'chaotic';
  }

  return { hardDays, easyDays, restDays, backToBackHardDays, easyDayCompliance, pattern };
}

export const fatigueProfileService = {
  async getFatigueProfile(athleteId: string): Promise<FatigueProfile | null> {
    try {
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

      const [{ data: athlete }, { data: activities }] = await Promise.all([
        supabaseAdmin.from('athletes').select('ftp, timezone').eq('id', athleteId).single(),
        supabaseAdmin
          .from('strava_activities')
          .select('start_date, moving_time_seconds, average_watts, tss')
          .eq('athlete_id', athleteId)
          .gte('start_date', eightWeeksAgo.toISOString())
          .order('start_date', { ascending: true }),
      ]);

      if (!activities || activities.length === 0) return null;

      const ftp = athlete?.ftp || null;
      const tz = athlete?.timezone || 'America/Los_Angeles';

      return {
        rampRate: computeRampRate(activities, tz),
        volumeProfile: computeVolumeProfile(activities, tz),
        hardEasyPattern: computeHardEasyPattern(activities, ftp, tz),
      };
    } catch (error) {
      logger.error('Error computing fatigue profile:', error);
      return null;
    }
  },

  formatForPrompt(profile: FatigueProfile | null): string {
    if (!profile) return '';

    let section = 'TRAINING LOAD TRENDS:\n';

    // Ramp rate
    if (profile.rampRate) {
      const r = profile.rampRate;
      const weekTSSStr = r.weeklyTSS.map((t) => Math.round(t)).join(' → ');
      section += `- Weekly TSS ramp: ${r.percentage > 0 ? '+' : ''}${r.percentage}% (${r.status})`;
      if (r.status === 'aggressive' || r.status === 'dangerous') {
        section += ' ⚠️ ELEVATED INJURY RISK';
      }
      section += `\n- Recent weeks: ${weekTSSStr} TSS`;
      if (r.currentPartialWeekTSS > 0) {
        section += ` (current week so far: ${r.currentPartialWeekTSS})`;
      }
      section += '\n';
    }

    // Volume profile
    if (profile.volumeProfile) {
      const v = profile.volumeProfile;
      section += `- Volume pattern: ${v.description} (${v.pattern})\n`;
      section += `- Avg TSS/ride: ${v.avgTSSPerRide}\n`;
    }

    // Hard/easy pattern
    if (profile.hardEasyPattern) {
      const h = profile.hardEasyPattern;
      const patternLabels: Record<HardEasyPattern['pattern'], string> = {
        polarized: 'Good hard/easy balance',
        'mostly-hard': 'Too many hard days',
        'mostly-easy': 'Mostly easy riding',
        chaotic: 'Inconsistent hard/easy pattern',
      };
      section += `- Hard/easy pattern (14d): ${patternLabels[h.pattern]} — ${h.hardDays} hard, ${h.easyDays} easy, ${h.restDays} rest\n`;
      section += `- Back-to-back hard days: ${h.backToBackHardDays}`;
      if (h.backToBackHardDays >= 3) {
        section += ' ⚠️ HIGH — suggest recovery';
      }
      section += `\n- Easy-day compliance: ${Math.round(h.easyDayCompliance * 100)}%\n`;
    }

    return section + '\n';
  },

  formatCoachingGuidelines(profile: FatigueProfile | null): string {
    if (!profile) return '';

    const lines: string[] = [];

    if (profile.rampRate && (profile.rampRate.status === 'aggressive' || profile.rampRate.status === 'dangerous')) {
      lines.push(`15. Training load is ramping ${profile.rampRate.status === 'dangerous' ? 'dangerously' : 'aggressively'} (${profile.rampRate.percentage > 0 ? '+' : ''}${profile.rampRate.percentage}% week-over-week) — prioritize holding or reducing volume to avoid injury/burnout`);
    }

    if (profile.volumeProfile?.pattern === 'high-frequency-moderate') {
      lines.push('16. This athlete rides frequently with moderate intensity — they tolerate higher weekly TSS spread across many easy days; don\'t over-warn about volume');
    }

    if (profile.hardEasyPattern) {
      if (profile.hardEasyPattern.easyDayCompliance < 0.5) {
        lines.push('17. Hard/easy day compliance is low — proactively suggest recovery rides or rest days after hard efforts');
      }
      if (profile.hardEasyPattern.backToBackHardDays >= 3) {
        lines.push('18. Multiple back-to-back hard days detected — strongly recommend inserting recovery before next hard session');
      }
    }

    return lines.length > 0 ? lines.join('\n') + '\n' : '';
  },
};
