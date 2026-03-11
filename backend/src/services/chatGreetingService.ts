import { anthropic, MODEL } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { trainingLoadService } from './trainingLoadService';
import { todayInTimezone } from '../utils/timezone';

export const chatGreetingService = {
  /**
   * Generate a contextual greeting message for chat
   */
  async generateGreeting(athleteId: string): Promise<string> {
    // Get athlete data
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .single();

    // Get recent rides (last 2 days, using athlete timezone)
    const tz = athlete?.timezone || 'America/Los_Angeles';
    const twoDaysAgo = new Date(todayInTimezone(tz) + 'T12:00:00');
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    const { data: recentRides } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', twoDaysAgo.toISOString())
      .order('start_date', { ascending: false })
      .limit(3);

    // Get training status
    const trainingStatus = await trainingLoadService.getTrainingStatus(athleteId);

    const today = todayInTimezone(tz);

    // Get today's health data
    const { data: healthData } = await supabaseAdmin
      .from('health_data')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('date', today)
      .single();

    // Get upcoming workouts (next 7 days)
    const { data: upcomingWorkouts } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(7);

    // Get today's workout
    const todaysWorkout = upcomingWorkouts?.find((w) => w.scheduled_date === today);

    // Check if they have a training plan (multiple workouts scheduled)
    const hasTrainingPlan = (upcomingWorkouts?.length || 0) >= 3;

    // Build context for greeting
    const context = this.buildGreetingContext(
      athlete,
      recentRides || [],
      trainingStatus,
      todaysWorkout,
      hasTrainingPlan,
      healthData
    );

    // Generate greeting with AI
    const greeting = await this.generateAIGreeting(context);

    return greeting;
  },

  /**
   * Build context for greeting generation - Comprehensive Daily Coaching Session
   */
  buildGreetingContext(
    athlete: any,
    recentRides: any[],
    trainingStatus: any,
    todaysWorkout: any,
    hasTrainingPlan: boolean,
    healthData: any
  ): string {
    const timeOfDay = this.getTimeOfDay(athlete?.timezone);

    return `You are an AI cycling coach starting a coaching session with an athlete who just opened the chat.

This is their FIRST chat of the day, so give them a comprehensive daily briefing like a real coach would.

TIME OF DAY: ${timeOfDay}

ATHLETE INFO:
- Name: ${athlete.full_name || 'there'}
- FTP: ${athlete.ftp || 'Not set'}W

RECENT TRAINING (Last 2 days):
${
  recentRides.length > 0
    ? recentRides
        .map(
          (r) =>
            `- ${r.name}: ${Math.round(r.moving_time_seconds / 60)}min, ${r.tss || 0} TSS, ${
              r.average_watts || 0
            }W avg`
        )
        .join('\n')
    : '- No recent rides'
}

FATIGUE & TRAINING READINESS:
- Freshness: ${trainingStatus?.tsb?.toFixed(1) || 'Unknown'} (positive = rested, negative = carrying fatigue)
- Fitness level: ${trainingStatus?.ctl?.toFixed(1) || 'Unknown'} (long-term training base)
- Recent fatigue: ${trainingStatus?.atl?.toFixed(1) || 'Unknown'} (last ~7 days of training stress)
- Recovery Status: ${
      trainingStatus?.tsb > 5
        ? 'Very fresh - ready for hard training'
        : trainingStatus?.tsb > -10
        ? 'Well recovered - good to train'
        : trainingStatus?.tsb > -20
        ? 'Slightly tired - recovery or easy day recommended'
        : 'Fatigued - need rest'
    }

HEALTH DATA (Today):
${
  healthData
    ? `- Sleep: ${healthData.sleep_hours ? `${healthData.sleep_hours} hours` : 'Not logged'}${healthData.sleep_quality ? ` (Quality: ${healthData.sleep_quality}/5)` : ''}
- HRV: ${healthData.hrv ? `${healthData.hrv}ms` : 'Not logged'}
- Resting HR: ${healthData.resting_heart_rate ? `${healthData.resting_heart_rate} bpm` : 'Not logged'}${healthData.body_battery ? `\n- Body Battery: ${healthData.body_battery}/100` : ''}${healthData.readiness_score ? `\n- Readiness: ${healthData.readiness_score}/100` : ''}${healthData.stress_level ? `\n- Stress Level: ${healthData.stress_level}/5` : ''}${healthData.notes ? `\n- Notes: ${healthData.notes}` : ''}`
    : '- No health data logged for today'
}

TODAY'S SCHEDULED WORKOUT:
${
  todaysWorkout
    ? `- ${todaysWorkout.workouts.name} (${todaysWorkout.workouts.workout_type}, ${todaysWorkout.workouts.duration_minutes}min, ${todaysWorkout.workouts.tss} TSS)`
    : '- No workout scheduled for today'
}

TRAINING PLAN:
${hasTrainingPlan ? '✅ Has structured plan in place' : '❌ No structured training plan'}

YOUR TASK:
Give them a comprehensive daily briefing that covers:

**ALWAYS include these 4 sections in order:**

1. **Greeting & Readiness Check**
   - Warm greeting (use time of day)
   - Tell them how recovered they are in PLAIN LANGUAGE (e.g., "you're well-rested", "you're carrying some fatigue from this week")
   - NEVER say TSB, CTL, or ATL to the athlete — translate the numbers into what they mean
   - Acknowledge recent training if any

2. **Sleep & Recovery Check**
   - If health data is available: comment on their sleep quality, HRV, resting HR
   - If health data is missing: ask "How did you sleep last night?" or "How are you feeling today?"
   - Make it conversational, not clinical
   - If they have Body Battery or Readiness scores, reference those

3. **Today's Training**
   - Show what's on their calendar for today (if anything)
   - If they have a workout: briefly describe it and tell them what to focus on
   - If no workout AND they're fatigued (TSB < -10 or big recent training): tell them it's a rest day and explain why rest is important ("Your body adapts during recovery, not during the ride")
   - If no workout AND they're fresh: suggest what they should do today based on their training status — YOU decide, don't ask what they want

4. **Open-Ended Check-In**
   - Invite them to share how they're feeling or ask questions
   - Examples: "How are the legs feeling?", "Any questions about your training?", "Let me know if anything needs adjusting."
   - Do NOT ask "what would you like to do today?" — you're the coach, you already told them what to do above

TONE & STYLE:
- Conversational and warm (like texting a coach friend)
- Use their name
- Use PLAIN LANGUAGE — never say "TSB", "CTL", "ATL", or "TSS" to the athlete. Say "freshness", "fitness", "fatigue", "training load" instead.
- Reference specific rides and numbers (power, duration, distance) but avoid jargon
- Don't be overly formal
- Keep it natural - this is a daily check-in, not a report
- 4-6 sentences total

EXAMPLE OUTPUT (with health data):

"Good morning ${athlete.full_name || 'there'}! Let's check in on where you're at today.

**How you're looking:** You're well-recovered and ready for quality work. Yesterday's tempo ride (65min, 180W avg) was solid — good effort.

**Sleep & Recovery:** You logged 7.5 hours with good quality — nice! HRV and resting heart rate both look solid.

**Today's Plan:** You've got a hard interval session scheduled — 4x8min at threshold, 75 minutes total.

How are the legs feeling? Let me know if anything needs adjusting."

EXAMPLE OUTPUT (without health data):

"Good morning ${athlete.full_name || 'there'}! Let's check in on where you're at today.

**How you're looking:** You're well-recovered and ready for quality work. Yesterday's tempo ride (65min, 180W avg) was solid — good effort.

**Sleep & Recovery:** How did you sleep last night?

**Today's Plan:** You've got a hard interval session scheduled — 4x8min at threshold, 75 minutes total.

How are the legs feeling? Let me know if anything needs adjusting."

Generate the greeting now:`;
  },

  /**
   * Generate AI greeting
   */
  async generateAIGreeting(context: string): Promise<string> {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: context,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text.trim();
      }

      throw new Error('Unexpected AI response format');
    } catch (error: any) {
      console.error('Error generating chat greeting:', error);

      // Fallback to simple greeting if AI fails
      return "Hey! 👋 What would you like to work on today? I can help you build a training plan, create workouts, or answer any training questions you have!";
    }
  },

  /**
   * Get time of day greeting using athlete's timezone
   */
  getTimeOfDay(timezone?: string): string {
    const tz = timezone || 'America/Los_Angeles';
    const hour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
    const h = parseInt(hour, 10);
    if (h < 12) return 'morning';
    if (h < 18) return 'afternoon';
    return 'evening';
  },
};
