import { anthropic, MODEL } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { trainingLoadService } from './trainingLoadService';
import { fatigueProfileService, type FatigueProfile } from './fatigueProfileService';
import { todayInTimezone, localDayToUTCRange } from '../utils/timezone';
import { logger } from '../utils/logger';

interface DailyAnalysisResult {
  date: string;
  summary: string;
  yesterdayRides: {
    name: string;
    duration: number;
    tss: number;
    avgPower: number;
  }[];
  yesterdayTotalTSS: number;
  currentTSB: number;
  currentCTL: number;
  currentATL: number;
  status: 'well-recovered' | 'slightly-tired' | 'fatigued' | 'fresh';
  recommendation: string;
  todaysWorkout: {
    name: string;
    type: string;
    duration: number;
    tss: number;
  } | null;
  suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more';
}

export interface TodaySuggestion {
  hasRiddenToday: boolean;
  suggestion: {
    summary: string;
    recommendation: string;
    suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more' | 'suggested-workout';
    todaysWorkout: { name: string; type: string; duration: number; tss: number } | null;
    suggestedWorkout: { name: string; type: string; duration: number; description: string } | null;
    status: 'well-recovered' | 'slightly-tired' | 'fatigued' | 'fresh';
    currentTSB: number;
    tomorrowsWorkout: { name: string; type: string; duration: number; tss: number } | null;
    todaysRides: { name: string; duration: number; tss: number }[];
  } | null;
}

// In-memory cache: key = "athleteId:YYYY-MM-DD:pre|post"
const suggestionCache = new Map<string, TodaySuggestion>();

/**
 * Clear cached suggestions for an athlete (call after new activity synced)
 */
export function clearSuggestionCache(athleteId: string): void {
  for (const key of suggestionCache.keys()) {
    if (key.startsWith(athleteId + ':')) {
      suggestionCache.delete(key);
    }
  }
}

export const dailyAnalysisService = {
  /**
   * Generate daily analysis for athlete
   */
  async generateDailyAnalysis(athleteId: string): Promise<DailyAnalysisResult> {
    // Use athlete's timezone for "today" and "yesterday"
    const { data: athleteRow } = await supabaseAdmin
      .from('athletes')
      .select('timezone')
      .eq('id', athleteId)
      .single();
    const tz = athleteRow?.timezone || 'America/Los_Angeles';
    const todayStr = todayInTimezone(tz);
    const yesterdayDate = new Date(todayStr + 'T12:00:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Convert local day boundaries to UTC for TIMESTAMPTZ queries
    const yesterdayUTC = localDayToUTCRange(yesterdayStr, tz);

    // Get yesterday's activities
    const { data: yesterdayActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', yesterdayUTC.start)
      .lte('start_date', yesterdayUTC.end)
      .order('start_date', { ascending: false });

    // Get current training status
    const trainingStatus = await trainingLoadService.getTrainingStatus(athleteId);

    // Get today's scheduled workout (calendar_entries.scheduled_date is a plain DATE, use local date)
    const { data: todayEntry } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', todayStr)
      .eq('completed', false)
      .single();

    // Get last 7 days for pattern analysis
    const sevenDaysAgo = new Date(todayStr + 'T12:00:00');
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoUTC = localDayToUTCRange(sevenDaysAgo.toISOString().split('T')[0], tz);

    const { data: recentActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', sevenDaysAgoUTC.start)
      .order('start_date', { ascending: false });

    // Build context for AI
    const context = this.buildAnalysisContext(
      yesterdayActivities || [],
      trainingStatus,
      todayEntry,
      recentActivities || []
    );

    // Get AI analysis
    const aiAnalysis = await this.getAIAnalysis(context);

    // Format yesterday's rides
    const yesterdayRides = (yesterdayActivities || []).map((activity: any) => ({
      name: activity.name || 'Ride',
      duration: Math.round(activity.moving_time_seconds / 60),
      tss: activity.tss || 0,
      avgPower: activity.average_watts || 0,
    }));

    const yesterdayTotalTSS = yesterdayRides.reduce((sum, r) => sum + r.tss, 0);

    // Determine status based on TSB
    let status: DailyAnalysisResult['status'];
    const tsb = trainingStatus?.tsb || 0;
    if (tsb > 10) status = 'fresh';
    else if (tsb > -5) status = 'well-recovered';
    else if (tsb > -25) status = 'slightly-tired';
    else status = 'fatigued';

    return {
      date: todayStr,
      summary: aiAnalysis.summary,
      yesterdayRides,
      yesterdayTotalTSS,
      currentTSB: trainingStatus?.tsb || 0,
      currentCTL: trainingStatus?.ctl || 0,
      currentATL: trainingStatus?.atl || 0,
      status,
      recommendation: aiAnalysis.recommendation,
      todaysWorkout: todayEntry
        ? {
            name: todayEntry.workouts.name,
            type: todayEntry.workouts.workout_type,
            duration: todayEntry.workouts.duration_minutes,
            tss: todayEntry.workouts.tss,
          }
        : null,
      suggestedAction: aiAnalysis.suggestedAction,
    };
  },

  /**
   * Build context for AI analysis
   */
  buildAnalysisContext(
    yesterdayActivities: any[],
    trainingStatus: any,
    todayEntry: any,
    recentActivities: any[]
  ): string {
    const yesterdayTSS = yesterdayActivities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const recentTotalTSS = recentActivities.reduce((sum, a) => sum + (a.tss || 0), 0);

    return `You are analyzing an athlete's training status for today.

YESTERDAY'S TRAINING:
${
  yesterdayActivities.length > 0
    ? yesterdayActivities
        .map(
          (a) =>
            `- ${a.name}: ${Math.round(a.moving_time_seconds / 60)}min, ${a.tss || 0} TSS, ${
              a.average_watts || 0
            }W avg`
        )
        .join('\n')
    : '- No rides yesterday (rest day)'
}
Total TSS: ${yesterdayTSS}

CURRENT FITNESS STATUS:
- TSB (Form): ${trainingStatus.tsb.toFixed(1)}
- CTL (Fitness): ${trainingStatus.ctl.toFixed(1)}
- ATL (Fatigue): ${trainingStatus.atl.toFixed(1)}

INTERPRETATION:
${
  trainingStatus.tsb > 5
    ? '✅ Very fresh - ready for hard training'
    : trainingStatus.tsb > -10
    ? '✅ Well recovered - good for normal training'
    : trainingStatus.tsb > -20
    ? '⚠️ Slightly tired - may need easier session'
    : '❌ Fatigued - consider rest or very easy'
}

LAST 7 DAYS PATTERN:
- Total rides: ${recentActivities.length}
- Total TSS: ${recentTotalTSS}
- Average TSS/day: ${(recentTotalTSS / 7).toFixed(1)}

TODAY'S SCHEDULED WORKOUT:
${
  todayEntry
    ? `- ${todayEntry.workouts.name}
- Type: ${todayEntry.workouts.workout_type}
- Duration: ${todayEntry.workouts.duration_minutes} minutes
- TSS: ${todayEntry.workouts.tss}`
    : '- No workout scheduled'
}

YOUR TASK:
Give a direct, no-fluff daily assessment. No greetings or filler.

Format as JSON:
{
  "summary": "1 sentence: current state + why (e.g. 'Well recovered after a rest day, fitness trending up.')",
  "recommendation": "1 sentence: what to do today (e.g. 'Hit your intervals hard — you can handle it.')",
  "suggestedAction": "proceed-as-planned|make-easier|add-rest|can-do-more"
}`;
  },

  /**
   * Get AI analysis
   */
  async getAIAnalysis(context: string): Promise<{
    summary: string;
    recommendation: string;
    suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more';
  }> {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: context,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // Try to parse JSON response
        try {
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          // If JSON parsing fails, extract manually
          console.warn('Could not parse AI JSON response, using fallback');
        }

        // Fallback: use the entire text as summary
        return {
          summary: content.text,
          recommendation: 'Continue with your scheduled training and listen to your body.',
          suggestedAction: 'proceed-as-planned',
        };
      }

      throw new Error('Unexpected AI response format');
    } catch (error: any) {
      console.error('Error getting AI analysis:', error);
      throw new Error('Failed to generate daily analysis');
    }
  },

  /**
   * Check if athlete has viewed today's analysis
   */
  async hasViewedToday(athleteId: string): Promise<boolean> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('last_daily_analysis_viewed, timezone')
      .eq('id', athleteId)
      .single();

    if (!athlete?.last_daily_analysis_viewed) return false;

    const tz = athlete.timezone || 'America/Los_Angeles';
    const todayStr = todayInTimezone(tz);
    const viewedStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz })
      .format(new Date(athlete.last_daily_analysis_viewed));

    return viewedStr === todayStr;
  },

  /**
   * Mark today's analysis as viewed
   */
  async markAsViewed(athleteId: string): Promise<void> {
    await supabaseAdmin
      .from('athletes')
      .update({
        last_daily_analysis_viewed: new Date().toISOString(),
      })
      .eq('id', athleteId);
  },

  /**
   * Check if athlete has ridden today (timezone-aware)
   */
  async hasRiddenToday(athleteId: string): Promise<boolean> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('timezone')
      .eq('id', athleteId)
      .single();

    const tz = athlete?.timezone || 'America/Los_Angeles';
    const todayStr = todayInTimezone(tz);
    const todayUTC = localDayToUTCRange(todayStr, tz);

    const { data: todayActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('id')
      .eq('athlete_id', athleteId)
      .gte('start_date', todayUTC.start)
      .lte('start_date', todayUTC.end)
      .limit(1);

    return (todayActivities?.length ?? 0) > 0;
  },

  /**
   * Get today's suggestion with in-memory cache
   */
  async getTodaySuggestion(athleteId: string): Promise<TodaySuggestion> {
    // Get athlete timezone
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('timezone')
      .eq('id', athleteId)
      .single();

    const tz = athlete?.timezone || 'America/Los_Angeles';
    const todayStr = todayInTimezone(tz);

    // Check if athlete has ridden today
    const riddenToday = await this.hasRiddenToday(athleteId);

    // Use different cache key for pre-ride vs post-ride
    const cacheKey = `${athleteId}:${todayStr}:${riddenToday ? 'post' : 'pre'}`;

    // Check cache
    const cached = suggestionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Compute local day boundaries in UTC for TIMESTAMPTZ queries
    const yesterdayDate = new Date(todayStr + 'T12:00:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const tomorrowDate = new Date(todayStr + 'T12:00:00');
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

    const sevenDaysAgo = new Date(todayStr + 'T12:00:00');
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const yesterdayUTC = localDayToUTCRange(yesterdayStr, tz);
    const todayUTC = localDayToUTCRange(todayStr, tz);
    const sevenDaysAgoUTC = localDayToUTCRange(sevenDaysAgo.toISOString().split('T')[0], tz);

    const [trainingStatus, yesterdayResult, todayEntry, tomorrowEntry, todayRidesResult, recentResult, fatigueProfile] = await Promise.all([
      trainingLoadService.getTrainingStatus(athleteId),
      supabaseAdmin
        .from('strava_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('start_date', yesterdayUTC.start)
        .lte('start_date', yesterdayUTC.end)
        .order('start_date', { ascending: false }),
      supabaseAdmin
        .from('calendar_entries')
        .select('*, workouts(*)')
        .eq('athlete_id', athleteId)
        .eq('scheduled_date', todayStr)
        .eq('completed', false)
        .single(),
      supabaseAdmin
        .from('calendar_entries')
        .select('*, workouts(*)')
        .eq('athlete_id', athleteId)
        .eq('scheduled_date', tomorrowStr)
        .eq('completed', false)
        .single(),
      supabaseAdmin
        .from('strava_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('start_date', todayUTC.start)
        .lte('start_date', todayUTC.end)
        .order('start_date', { ascending: false }),
      supabaseAdmin
        .from('strava_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('start_date', sevenDaysAgoUTC.start)
        .order('start_date', { ascending: false }),
      fatigueProfileService.getFatigueProfile(athleteId),
    ]);

    const yesterdayActivities = yesterdayResult.data || [];
    const recentActivities = recentResult.data || [];
    const todayActivities = todayRidesResult.data || [];
    const hasPlannedWorkout = !!todayEntry.data?.workouts;
    const hasTomorrowWorkout = !!tomorrowEntry.data?.workouts;

    // Build AI context — use post-ride prompt if ridden today
    let context: string;
    if (riddenToday) {
      context = this.buildPostRideContext(
        todayActivities,
        trainingStatus,
        tomorrowEntry.data,
        recentActivities,
        fatigueProfile
      );
    } else {
      context = this.buildSuggestionContext(
        yesterdayActivities,
        trainingStatus,
        todayEntry.data,
        recentActivities,
        hasPlannedWorkout,
        fatigueProfile
      );
    }

    // Get AI suggestion
    const aiResult = await this.getSuggestionAIAnalysis(context, riddenToday ? true : hasPlannedWorkout);

    // Determine status
    const tsb = trainingStatus?.tsb || 0;
    let status: TodaySuggestion['suggestion'] extends null ? never : NonNullable<TodaySuggestion['suggestion']>['status'];
    if (tsb > 5) status = 'fresh';
    else if (tsb > -10) status = 'well-recovered';
    else if (tsb > -20) status = 'slightly-tired';
    else status = 'fatigued';

    const todaysRides = todayActivities.map((a: any) => ({
      name: a.name || 'Ride',
      duration: Math.round(a.moving_time_seconds / 60),
      tss: a.tss || 0,
    }));

    const tomorrowsWorkout = hasTomorrowWorkout
      ? {
          name: tomorrowEntry.data.workouts.name,
          type: tomorrowEntry.data.workouts.workout_type,
          duration: tomorrowEntry.data.workouts.duration_minutes,
          tss: tomorrowEntry.data.workouts.tss,
        }
      : null;

    const result: TodaySuggestion = {
      hasRiddenToday: riddenToday,
      suggestion: {
        summary: aiResult.summary,
        recommendation: aiResult.recommendation,
        suggestedAction: aiResult.suggestedAction,
        todaysWorkout: hasPlannedWorkout
          ? {
              name: todayEntry.data.workouts.name,
              type: todayEntry.data.workouts.workout_type,
              duration: todayEntry.data.workouts.duration_minutes,
              tss: todayEntry.data.workouts.tss,
            }
          : null,
        suggestedWorkout: aiResult.suggestedWorkout || null,
        status,
        currentTSB: tsb,
        tomorrowsWorkout,
        todaysRides,
      },
    };

    suggestionCache.set(cacheKey, result);
    return result;
  },

  /**
   * Build context for today's suggestion AI prompt
   */
  buildSuggestionContext(
    yesterdayActivities: any[],
    trainingStatus: any,
    todayEntry: any,
    recentActivities: any[],
    hasPlannedWorkout: boolean,
    fatigueProfile: FatigueProfile | null = null
  ): string {
    const yesterdayTSS = yesterdayActivities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const recentTotalTSS = recentActivities.reduce((sum, a) => sum + (a.tss || 0), 0);

    const base = `You are a cycling coach assessing an athlete's readiness for today.

YESTERDAY'S TRAINING:
${
  yesterdayActivities.length > 0
    ? yesterdayActivities
        .map(
          (a) =>
            `- ${a.name}: ${Math.round(a.moving_time_seconds / 60)}min, ${a.tss || 0} TSS, ${
              a.average_watts || 0
            }W avg`
        )
        .join('\n')
    : '- No rides yesterday (rest day)'
}
Total TSS: ${yesterdayTSS}

CURRENT FITNESS STATUS:
- TSB (Form): ${trainingStatus?.tsb?.toFixed(1) ?? '0.0'}
- CTL (Fitness): ${trainingStatus?.ctl?.toFixed(1) ?? '0.0'}
- ATL (Fatigue): ${trainingStatus?.atl?.toFixed(1) ?? '0.0'}

LAST 7 DAYS:
- Total rides: ${recentActivities.length}
- Total TSS: ${recentTotalTSS}
- Average TSS/day: ${(recentTotalTSS / 7).toFixed(1)}

${fatigueProfileService.formatForPrompt(fatigueProfile)}`;

    if (hasPlannedWorkout && todayEntry?.workouts) {
      return `${base}

TODAY'S SCHEDULED WORKOUT:
- ${todayEntry.workouts.name}
- Type: ${todayEntry.workouts.workout_type}
- Duration: ${todayEntry.workouts.duration_minutes} minutes
- TSS: ${todayEntry.workouts.tss}

YOUR TASK:
Give a direct, no-fluff assessment. If the athlete is significantly fatigued (TSB < -20) or overtrained, don't be afraid to recommend skipping the workout entirely and taking a rest day — use "add-rest". No greetings or filler.

Format as JSON:
{
  "summary": "1 sentence: current state (e.g. 'Carrying some fatigue from yesterday's 90 TSS effort.' or 'Deeply fatigued after a huge training week.')",
  "recommendation": "1 sentence: what to do (e.g. 'Proceed as planned — you're ready for it.' or 'I'd suggest skipping today's workout and resting — your body will benefit more from recovery right now.')",
  "suggestedAction": "proceed-as-planned|make-easier|add-rest|can-do-more"
}`;
    }

    return `${base}

No workout is scheduled for today.

YOUR TASK:
Suggest what the athlete should do today — this could be a workout OR a rest day. If the athlete is significantly fatigued (TSB < -20), overtrained, or has had multiple hard days in a row, prescribe a rest day. Rest is a real prescription. Be direct, no filler.

Format as JSON:
{
  "summary": "1 sentence: current state (e.g. 'Fresh after 2 rest days with good fitness.' or 'Carrying heavy fatigue after a big training week.')",
  "recommendation": "1 sentence: why this choice (e.g. 'Good day for tempo work to build on your base.' or 'With the fatigue you're carrying, I'd suggest a full rest day to let your body recover.')",
  "suggestedAction": "suggested-workout",
  "suggestedWorkout": {
    "name": "Workout Name (or 'Rest Day')",
    "type": "rest|recovery|endurance|tempo|threshold|vo2max",
    "duration": 0,
    "description": "1 sentence description (for rest: why rest is the right call)"
  }
}`;
  },

  /**
   * Build context for post-ride summary + tomorrow preview
   */
  buildPostRideContext(
    todayActivities: any[],
    trainingStatus: any,
    tomorrowEntry: any,
    recentActivities: any[],
    fatigueProfile: FatigueProfile | null = null
  ): string {
    const todayTSS = todayActivities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const recentTotalTSS = recentActivities.reduce((sum, a) => sum + (a.tss || 0), 0);
    const hasTomorrow = !!tomorrowEntry?.workouts;

    const ridesText = todayActivities
      .map(
        (a) =>
          '- ' + a.name + ': ' + Math.round(a.moving_time_seconds / 60) + 'min, ' + (a.tss || 0) + ' TSS, ' + (a.average_watts || 0) + 'W avg'
      )
      .join('\n');

    let tomorrowSection: string;
    if (hasTomorrow) {
      tomorrowSection = '- ' + tomorrowEntry.workouts.name + '\n'
        + '- Type: ' + tomorrowEntry.workouts.workout_type + '\n'
        + '- Duration: ' + tomorrowEntry.workouts.duration_minutes + ' minutes\n'
        + '- TSS: ' + tomorrowEntry.workouts.tss + '\n\n'
        + 'YOUR TASK:\n'
        + 'Summarize today\'s training effort, preview tomorrow\'s workout, and assess recovery outlook. Be direct, no filler.\n\n'
        + 'Format as JSON:\n'
        + '{\n'
        + '  "summary": "1 sentence: today\'s ride recap (e.g. \'Solid 75 TSS endurance ride, right on target for a recovery day.\')",\n'
        + '  "recommendation": "1 sentence: recovery outlook + tomorrow preview (e.g. \'Get good rest tonight — tomorrow\'s threshold intervals will need fresh legs.\')",\n'
        + '  "suggestedAction": "proceed-as-planned|make-easier|add-rest|can-do-more"\n'
        + '}';
    } else {
      tomorrowSection = '- No workout scheduled\n\n'
        + 'YOUR TASK:\n'
        + 'Summarize today\'s training effort and suggest what to do tomorrow — this could be a workout OR a rest day. If the athlete is significantly fatigued (TSB < -20), overtrained, or has had multiple hard days in a row, prescribe rest. Rest is a real prescription. Be direct, no filler.\n\n'
        + 'Format as JSON:\n'
        + '{\n'
        + '  "summary": "1 sentence: today\'s ride recap (e.g. \'Solid 75 TSS endurance ride, right on target.\')",\n'
        + '  "recommendation": "1 sentence: why this choice (e.g. \'After today\'s big effort, an easy spin tomorrow will aid recovery.\' or \'With the load you\'ve built up, I\'d suggest taking tomorrow off to let your body recover.\')",\n'
        + '  "suggestedAction": "proceed-as-planned",\n'
        + '  "suggestedWorkout": {\n'
        + '    "name": "Workout Name (or \'Rest Day\')",\n'
        + '    "type": "rest|recovery|endurance|tempo|threshold|vo2max",\n'
        + '    "duration": 0,\n'
        + '    "description": "1 sentence description"\n'
        + '  }\n'
        + '}';
    }

    return 'You are a cycling coach reviewing an athlete\'s completed training for today and previewing tomorrow.\n\n'
      + 'TODAY\'S COMPLETED RIDES:\n'
      + ridesText + '\n'
      + 'Total TSS today: ' + todayTSS + '\n\n'
      + 'CURRENT FITNESS STATUS:\n'
      + '- TSB (Form): ' + (trainingStatus?.tsb?.toFixed(1) ?? '0.0') + '\n'
      + '- CTL (Fitness): ' + (trainingStatus?.ctl?.toFixed(1) ?? '0.0') + '\n'
      + '- ATL (Fatigue): ' + (trainingStatus?.atl?.toFixed(1) ?? '0.0') + '\n\n'
      + 'LAST 7 DAYS:\n'
      + '- Total rides: ' + recentActivities.length + '\n'
      + '- Total TSS: ' + recentTotalTSS + '\n'
      + '- Average TSS/day: ' + (recentTotalTSS / 7).toFixed(1) + '\n\n'
      + fatigueProfileService.formatForPrompt(fatigueProfile) + '\n\n'
      + 'TOMORROW\'S SCHEDULED WORKOUT:\n'
      + tomorrowSection;
  },

  /**
   * Get AI analysis for today's suggestion
   */
  async getSuggestionAIAnalysis(
    context: string,
    hasPlannedWorkout: boolean
  ): Promise<{
    summary: string;
    recommendation: string;
    suggestedAction: TodaySuggestion['suggestion'] extends null ? never : NonNullable<TodaySuggestion['suggestion']>['suggestedAction'];
    suggestedWorkout?: { name: string; type: string; duration: number; description: string };
  }> {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: context }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        try {
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (e) {
          logger.warn('Could not parse suggestion AI JSON response, using fallback');
        }

        return {
          summary: content.text,
          recommendation: 'Listen to your body and train accordingly.',
          suggestedAction: hasPlannedWorkout ? 'proceed-as-planned' : 'suggested-workout',
        };
      }

      throw new Error('Unexpected AI response format');
    } catch (error: any) {
      logger.error('Error getting suggestion AI analysis:', error);
      throw new Error('Failed to generate today\'s suggestion');
    }
  },
};
