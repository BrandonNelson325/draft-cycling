import { anthropic, MODEL } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { trainingLoadService } from './trainingLoadService';

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

export const dailyAnalysisService = {
  /**
   * Generate daily analysis for athlete
   */
  async generateDailyAnalysis(athleteId: string): Promise<DailyAnalysisResult> {
    // Get yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(yesterday);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Get yesterday's activities
    const { data: yesterdayActivities } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', yesterday.toISOString())
      .lte('start_date', yesterdayEnd.toISOString())
      .order('start_date', { ascending: false });

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
Provide a brief, friendly daily analysis with:
1. A welcoming greeting
2. Assessment of their recovery (based on TSB and yesterday's training)
3. Recommendation for today
4. Whether today's workout is appropriate or needs adjustment

Be conversational and motivating. Keep it under 150 words.

Format as JSON:
{
  "summary": "Brief overview in 2-3 sentences",
  "recommendation": "Specific recommendation for today",
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
};
