import { anthropic, MODEL } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { trainingLoadService } from './trainingLoadService';
import { fatigueProfileService, type FatigueProfile } from './fatigueProfileService';
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
  } | null;
}

// In-memory cache: key = "athleteId:YYYY-MM-DD"
const suggestionCache = new Map<string, TodaySuggestion>();

export const dailyAnalysisService = {
  /**
   * Generate daily analysis for athlete
   */
  async generateDailyAnalysis(athleteId: string): Promise<DailyAnalysisResult> {
    // Get yesterday's date as a YYYY-MM-DD string (timezone-safe date comparison)
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterdayDate = new Date(todayStr + 'T00:00:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    // Get yesterday's activities using local date to avoid UTC offset mismatches
    const { data: yesterdayActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date_local', yesterdayStr + 'T00:00:00')
      .lte('start_date_local', yesterdayStr + 'T23:59:59')
      .order('start_date_local', { ascending: false });

    // Get current training status
    const trainingStatus = await trainingLoadService.getTrainingStatus(athleteId);

    // Get today's scheduled workout
    const today = new Date().toISOString().split('T')[0];
    const { data: todayEntry } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .eq('scheduled_date', today)
      .eq('completed', false)
      .single();

    // Get last 7 days for pattern analysis
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', sevenDaysAgo.toISOString())
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
    if (tsb > 5) status = 'fresh';
    else if (tsb > -10) status = 'well-recovered';
    else if (tsb > -20) status = 'slightly-tired';
    else status = 'fatigued';

    return {
      date: new Date().toISOString().split('T')[0],
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
      .select('last_daily_analysis_viewed')
      .eq('id', athleteId)
      .single();

    if (!athlete?.last_daily_analysis_viewed) return false;

    const lastViewed = new Date(athlete.last_daily_analysis_viewed);
    const today = new Date();

    return (
      lastViewed.getFullYear() === today.getFullYear() &&
      lastViewed.getMonth() === today.getMonth() &&
      lastViewed.getDate() === today.getDate()
    );
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
   * Get today's date string in the athlete's timezone
   */
  todayInTimezone(tz: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
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
    const todayStr = this.todayInTimezone(tz);

    const { data: todayActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('id')
      .eq('athlete_id', athleteId)
      .gte('start_date_local', todayStr + 'T00:00:00')
      .lte('start_date_local', todayStr + 'T23:59:59')
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
    const todayStr = this.todayInTimezone(tz);
    const cacheKey = `${athleteId}:${todayStr}`;

    // Check cache
    const cached = suggestionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Fetch context data in parallel
    const yesterdayDate = new Date(todayStr + 'T12:00:00');
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const sevenDaysAgo = new Date(todayStr + 'T12:00:00');
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [trainingStatus, yesterdayResult, todayEntry, recentResult, fatigueProfile] = await Promise.all([
      trainingLoadService.getTrainingStatus(athleteId),
      supabaseAdmin
        .from('strava_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('start_date_local', yesterdayStr + 'T00:00:00')
        .lte('start_date_local', yesterdayStr + 'T23:59:59')
        .order('start_date_local', { ascending: false }),
      supabaseAdmin
        .from('calendar_entries')
        .select('*, workouts(*)')
        .eq('athlete_id', athleteId)
        .eq('scheduled_date', todayStr)
        .eq('completed', false)
        .single(),
      supabaseAdmin
        .from('strava_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('start_date', sevenDaysAgo.toISOString())
        .order('start_date', { ascending: false }),
      fatigueProfileService.getFatigueProfile(athleteId),
    ]);

    const yesterdayActivities = yesterdayResult.data || [];
    const recentActivities = recentResult.data || [];
    const hasPlannedWorkout = !!todayEntry.data?.workouts;

    // Build AI context
    const context = this.buildSuggestionContext(
      yesterdayActivities,
      trainingStatus,
      todayEntry.data,
      recentActivities,
      hasPlannedWorkout,
      fatigueProfile
    );

    // Get AI suggestion
    const aiResult = await this.getSuggestionAIAnalysis(context, hasPlannedWorkout);

    // Determine status
    const tsb = trainingStatus?.tsb || 0;
    let status: TodaySuggestion['suggestion'] extends null ? never : NonNullable<TodaySuggestion['suggestion']>['status'];
    if (tsb > 5) status = 'fresh';
    else if (tsb > -10) status = 'well-recovered';
    else if (tsb > -20) status = 'slightly-tired';
    else status = 'fatigued';

    const result: TodaySuggestion = {
      hasRiddenToday: false,
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
Give a direct, no-fluff assessment. No greetings or filler.

Format as JSON:
{
  "summary": "1 sentence: current state (e.g. 'Carrying some fatigue from yesterday's 90 TSS effort.')",
  "recommendation": "1 sentence: what to do with today's workout (e.g. 'Proceed as planned — you're ready for it.')",
  "suggestedAction": "proceed-as-planned|make-easier|add-rest|can-do-more"
}`;
    }

    return `${base}

No workout is scheduled for today.

YOUR TASK:
Suggest a specific workout. Be direct, no filler.

Format as JSON:
{
  "summary": "1 sentence: current state (e.g. 'Fresh after 2 rest days with good fitness.')",
  "recommendation": "1 sentence: why this workout (e.g. 'Good day for tempo work to build on your base.')",
  "suggestedAction": "suggested-workout",
  "suggestedWorkout": {
    "name": "Workout Name",
    "type": "recovery|endurance|tempo|threshold|vo2max",
    "duration": 60,
    "description": "1 sentence description"
  }
}`;
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
