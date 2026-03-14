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
 * Build the ACWR-based training status block for AI prompts.
 * This MUST match the logic in FreshnessGauge so the text and gauge agree.
 */
function buildTrainingStatusBlock(trainingStatus: any): string {
  const ctl = trainingStatus?.ctl ?? 0;
  const atl = trainingStatus?.atl ?? 0;
  const tsb = trainingStatus?.tsb ?? 0;

  let statusLabel: string;
  let statusDescription: string;

  if (ctl < 15) {
    // New athlete — not enough data for ACWR
    if (tsb > 10) {
      statusLabel = 'Fresh';
      statusDescription = 'New athlete, ready to train';
    } else if (tsb >= -10) {
      statusLabel = 'Balanced';
      statusDescription = 'New athlete, good balance of training and recovery';
    } else {
      statusLabel = 'Building';
      statusDescription = 'New athlete, building training base';
    }
  } else {
    const acwr = atl / ctl;
    if (acwr > 1.5) {
      statusLabel = 'Overtraining';
      statusDescription = `Training load is spiking dangerously (ACWR ${acwr.toFixed(2)}). High injury/burnout risk.`;
    } else if (acwr > 1.3) {
      statusLabel = 'Overreaching';
      statusDescription = `Heavy training block (ACWR ${acwr.toFixed(2)}). Functional overreaching — plan recovery soon.`;
    } else if (acwr > 1.0) {
      statusLabel = 'Productive';
      statusDescription = `In the sweet spot (ACWR ${acwr.toFixed(2)}). Building fitness effectively.`;
    } else if (acwr > 0.8) {
      statusLabel = 'Balanced';
      statusDescription = `Maintained fitness (ACWR ${acwr.toFixed(2)}). Ready for harder efforts.`;
    } else if (ctl > 40 && acwr < 0.5) {
      statusLabel = 'Detraining';
      statusDescription = `Very low recent training (ACWR ${acwr.toFixed(2)}). Fitness is fading.`;
    } else {
      statusLabel = 'Fresh';
      statusDescription = `Well-rested (ACWR ${acwr.toFixed(2)}). Ideal for racing or hard efforts.`;
    }
  }

  return `CURRENT TRAINING STATUS:
- Status: ${statusLabel} — ${statusDescription}
- CTL (Fitness): ${ctl.toFixed(1)} (42-day chronic load)
- ATL (Fatigue): ${atl.toFixed(1)} (7-day acute load)
- TSB (Form): ${tsb.toFixed(1)} (CTL minus ATL)
${ctl >= 15 ? `- ACWR: ${(atl / ctl).toFixed(2)} (Acute:Chronic ratio — the primary metric)` : '- ACWR: N/A (not enough training history)'}

IMPORTANT: Your assessment MUST align with the "${statusLabel}" status shown above. The ACWR (not TSB alone) determines training status.
- Do NOT say the athlete is "fresh" or has "low fatigue" if the status is Productive, Overreaching, or Overtraining.
- Do NOT say the athlete is "fatigued" or "overtrained" if the status is Fresh or Balanced.
- Base your description of the training week on the ACTUAL ride data below, not assumptions.`;
}

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

    // Determine status using ACWR (must match FreshnessGauge logic)
    const tsb = trainingStatus?.tsb || 0;
    const statusCtl = trainingStatus?.ctl || 0;
    const statusAtl = trainingStatus?.atl || 0;
    let status: DailyAnalysisResult['status'];
    if (statusCtl < 15) {
      if (tsb > 10) status = 'fresh';
      else if (tsb > -5) status = 'well-recovered';
      else status = 'slightly-tired';
    } else {
      const acwr = statusAtl / statusCtl;
      if (acwr > 1.3) status = 'fatigued';
      else if (acwr > 1.0) status = 'slightly-tired';
      else if (acwr > 0.8) status = 'well-recovered';
      else status = 'fresh';
    }

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

    const recentRideList = recentActivities
      .map((a: any) => `  - ${new Date(a.start_date).toLocaleDateString()}: ${a.name} — ${Math.round(a.moving_time_seconds / 60)}min, ${a.tss || 0} TSS`)
      .join('\n');

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

${buildTrainingStatusBlock(trainingStatus)}

LAST 7 DAYS (${recentActivities.length} rides, ${recentTotalTSS} total TSS, ${(recentTotalTSS / 7).toFixed(1)} avg TSS/day):
${recentRideList || '  (no rides)'}

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
Give a direct, no-fluff daily assessment that MATCHES the training status above. Base your description on the ACTUAL ride data. No greetings or filler.

Format as JSON:
{
  "summary": "1 sentence: current state referencing actual data (e.g. 'Accumulated 350 TSS over 4 rides this week — productive overload.')",
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

    // Determine status using ACWR (must match FreshnessGauge logic)
    const tsb = trainingStatus?.tsb || 0;
    const ctl = trainingStatus?.ctl || 0;
    const atl = trainingStatus?.atl || 0;
    let status: TodaySuggestion['suggestion'] extends null ? never : NonNullable<TodaySuggestion['suggestion']>['status'];
    if (ctl < 15) {
      // New athlete fallback
      if (tsb > 5) status = 'fresh';
      else if (tsb > -10) status = 'well-recovered';
      else status = 'slightly-tired';
    } else {
      const acwr = atl / ctl;
      if (acwr > 1.3) status = 'fatigued';
      else if (acwr > 1.0) status = 'slightly-tired';
      else if (acwr > 0.8) status = 'well-recovered';
      else status = 'fresh';
    }

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

    const recentRideList = recentActivities
      .map((a) => `  - ${new Date(a.start_date).toLocaleDateString()}: ${a.name} — ${Math.round(a.moving_time_seconds / 60)}min, ${a.tss || 0} TSS`)
      .join('\n');

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

${buildTrainingStatusBlock(trainingStatus)}

LAST 7 DAYS (${recentActivities.length} rides, ${recentTotalTSS} total TSS, ${(recentTotalTSS / 7).toFixed(1)} avg TSS/day):
${recentRideList || '  (no rides)'}

${fatigueProfileService.formatForPrompt(fatigueProfile)}`;

    if (hasPlannedWorkout && todayEntry?.workouts) {
      return `${base}

TODAY'S SCHEDULED WORKOUT:
- ${todayEntry.workouts.name}
- Type: ${todayEntry.workouts.workout_type}
- Duration: ${todayEntry.workouts.duration_minutes} minutes
- TSS: ${todayEntry.workouts.tss}

YOUR TASK:
Give a direct, no-fluff assessment that MATCHES the training status above. If Overreaching/Overtraining, recommend rest or easier sessions. If Fresh/Balanced, the athlete can push harder. No greetings or filler.
Base your description on the ACTUAL ride data — don't guess or assume what the week looked like.

Format as JSON:
{
  "summary": "1 sentence: current state referencing actual training data (e.g. 'Carrying fatigue from 5 rides totaling 400 TSS this week.' or 'Well-rested after 2 easy days.')",
  "recommendation": "1 sentence: what to do (e.g. 'Proceed as planned — you're ready for it.' or 'I'd suggest skipping today's workout and resting — your body will benefit more from recovery right now.')",
  "suggestedAction": "proceed-as-planned|make-easier|add-rest|can-do-more"
}`;
    }

    return `${base}

No workout is scheduled for today.

YOUR TASK:
Suggest what the athlete should do today — this could be a workout OR a rest day. Your suggestion MUST match the training status above.
If Overreaching/Overtraining: prescribe rest or very easy recovery. If Productive: moderate training is fine. If Fresh/Balanced: can push harder.
Base your description on the ACTUAL ride data — don't guess or assume what the week looked like. Be direct, no filler.

Format as JSON:
{
  "summary": "1 sentence: current state referencing actual training data (e.g. 'Accumulated 450 TSS across 5 rides this week — legs are heavy.' or 'Only 1 easy ride in 7 days — well-rested.')",
  "recommendation": "1 sentence: why this choice (e.g. 'Good day for tempo work to build on your base.' or 'With the load you've built up, take a full rest day.')",
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
        + 'Summarize today\'s training effort, preview tomorrow\'s workout, and assess recovery outlook. Your assessment MUST match the training status above. Be direct, no filler.\n'
        + 'Base your description on the ACTUAL ride data — don\'t guess or assume what the week looked like.\n\n'
        + 'Format as JSON:\n'
        + '{\n'
        + '  "summary": "1 sentence: today\'s ride recap referencing actual data (e.g. \'Solid 75 TSS endurance ride on top of a 400 TSS week.\')",\n'
        + '  "recommendation": "1 sentence: recovery outlook + tomorrow preview (e.g. \'Get good rest tonight — tomorrow\'s threshold intervals will need fresh legs.\')",\n'
        + '  "suggestedAction": "proceed-as-planned|make-easier|add-rest|can-do-more"\n'
        + '}';
    } else {
      tomorrowSection = '- No workout scheduled\n\n'
        + 'YOUR TASK:\n'
        + 'Summarize today\'s training effort and suggest what to do tomorrow — this could be a workout OR a rest day. Your suggestion MUST match the training status above.\n'
        + 'If Overreaching/Overtraining: prescribe rest or very easy recovery. If Productive: moderate training is fine. If Fresh/Balanced: can push harder.\n'
        + 'Base your description on the ACTUAL ride data — don\'t guess or assume what the week looked like. Be direct, no filler.\n\n'
        + 'Format as JSON:\n'
        + '{\n'
        + '  "summary": "1 sentence: today\'s ride recap referencing actual data (e.g. \'Big 136 TSS effort on top of a demanding week.\')",\n'
        + '  "recommendation": "1 sentence: why this choice (e.g. \'After today\'s big effort, an easy spin tomorrow will aid recovery.\' or \'With the load you\'ve built up, take tomorrow off.\')",\n'
        + '  "suggestedAction": "proceed-as-planned",\n'
        + '  "suggestedWorkout": {\n'
        + '    "name": "Workout Name (or \'Rest Day\')",\n'
        + '    "type": "rest|recovery|endurance|tempo|threshold|vo2max",\n'
        + '    "duration": 0,\n'
        + '    "description": "1 sentence description"\n'
        + '  }\n'
        + '}';
    }

    const recentRideList = recentActivities
      .map((a) => '  - ' + new Date(a.start_date).toLocaleDateString() + ': ' + a.name + ' — ' + Math.round(a.moving_time_seconds / 60) + 'min, ' + (a.tss || 0) + ' TSS')
      .join('\n');

    return 'You are a cycling coach reviewing an athlete\'s completed training for today and previewing tomorrow.\n\n'
      + 'TODAY\'S COMPLETED RIDES:\n'
      + ridesText + '\n'
      + 'Total TSS today: ' + todayTSS + '\n\n'
      + buildTrainingStatusBlock(trainingStatus) + '\n\n'
      + 'LAST 7 DAYS (' + recentActivities.length + ' rides, ' + recentTotalTSS + ' total TSS, ' + (recentTotalTSS / 7).toFixed(1) + ' avg TSS/day):\n'
      + (recentRideList || '  (no rides)') + '\n\n'
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
