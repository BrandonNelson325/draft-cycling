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
      .limit(5);

    // Get training status
    const trainingStatus = await trainingLoadService.getTrainingStatus(athleteId);

    const today = todayInTimezone(tz);
    const todayStart = new Date(today + 'T00:00:00');
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Get today's health data
    const { data: healthData } = await supabaseAdmin
      .from('health_data')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('date', today)
      .single();

    // Check if athlete already rode today (using athlete's timezone, not UTC)
    const todaysRides = (recentRides || []).filter((r: any) => {
      const rideDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(r.start_date));
      return rideDate === today;
    });
    const alreadyRodeToday = todaysRides.length > 0;

    // Get upcoming workouts (next 7 days)
    const { data: upcomingWorkouts } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', today)
      .order('scheduled_date', { ascending: true })
      .limit(7);

    // Get today's workout and tomorrow's workout
    const todaysWorkout = upcomingWorkouts?.find((w) => w.scheduled_date === today);
    const tomorrowsWorkout = upcomingWorkouts?.find((w) => w.scheduled_date === tomorrowStr);

    // Check if they have a training plan (multiple workouts scheduled)
    const hasTrainingPlan = (upcomingWorkouts?.length || 0) >= 3;

    // Build context for greeting
    const context = this.buildGreetingContext(
      athlete,
      recentRides || [],
      trainingStatus,
      todaysWorkout,
      hasTrainingPlan,
      healthData,
      alreadyRodeToday,
      todaysRides,
      tomorrowsWorkout
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
    healthData: any,
    alreadyRodeToday: boolean = false,
    todaysRides: any[] = [],
    tomorrowsWorkout: any = null
  ): string {
    const timeOfDay = this.getTimeOfDay(athlete?.timezone);
    const greetingTz = athlete?.timezone || 'America/Los_Angeles';
    const greetingToday = new Intl.DateTimeFormat('en-CA', { timeZone: greetingTz }).format(new Date());

    const todaysRideSummary = todaysRides.length > 0
      ? todaysRides
          .map(
            (r: any) =>
              `- ${r.name}: ${Math.round(r.moving_time_seconds / 60)}min, ${r.tss || 0} TSS, ${
                r.average_watts || 0
              }W avg`
          )
          .join('\n')
      : '';

    return `You are an AI cycling coach starting a coaching session with an athlete who just opened the chat.

This is their FIRST chat of the day, so give them a comprehensive daily briefing like a real coach would.

TIME OF DAY: ${timeOfDay}

ATHLETE INFO:
- Name: ${athlete.full_name || 'there'}
- FTP: ${athlete.ftp || 'Not set'}W

ALREADY RODE TODAY: ${alreadyRodeToday ? 'YES' : 'NO'}
${alreadyRodeToday ? `TODAY'S COMPLETED RIDE(S):\n${todaysRideSummary}` : ''}

RECENT TRAINING (Last 2 days):
${
  recentRides.length > 0
    ? recentRides
        .map(
          (r: any) => {
            const rideLocalDate = new Intl.DateTimeFormat('en-CA', { timeZone: greetingTz }).format(new Date(r.start_date));
            const label = rideLocalDate === greetingToday ? 'TODAY' : 'YESTERDAY';
            return `- [${label}] ${r.name}: ${Math.round(r.moving_time_seconds / 60)}min, ${r.tss || 0} TSS, ${
              r.average_watts || 0
            }W avg`;
          }
        )
        .join('\n')
    : '- No recent rides'
}

FATIGUE & TRAINING READINESS:
- Fitness level: ${trainingStatus?.ctl?.toFixed(1) || 'Unknown'} (long-term training base)
- Recent fatigue: ${trainingStatus?.atl?.toFixed(1) || 'Unknown'} (last ~7 days of training stress)
- Freshness: ${trainingStatus?.tsb?.toFixed(1) || 'Unknown'} (fitness minus fatigue)
${(() => {
      const ctl = trainingStatus?.ctl || 0;
      const atl = trainingStatus?.atl || 0;
      const tsb = trainingStatus?.tsb || 0;
      if (ctl < 15) {
        return tsb > 5 ? '- Recovery Status: Fresh - ready to train' : tsb > -10 ? '- Recovery Status: Balanced' : '- Recovery Status: Building fitness';
      }
      const acwr = atl / ctl;
      if (acwr > 1.5) return `- Recovery Status: Overtraining risk (ACWR ${acwr.toFixed(2)}) - need rest urgently`;
      if (acwr > 1.3) return `- Recovery Status: Overreaching (ACWR ${acwr.toFixed(2)}) - recovery day recommended`;
      if (acwr > 1.0) return `- Recovery Status: Productive (ACWR ${acwr.toFixed(2)}) - building fitness, training on track`;
      if (acwr > 0.8) return `- Recovery Status: Balanced (ACWR ${acwr.toFixed(2)}) - maintained fitness, ready for harder efforts`;
      return `- Recovery Status: Fresh (ACWR ${acwr.toFixed(2)}) - well-rested, ideal for hard training`;
    })()}

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

TOMORROW'S SCHEDULED WORKOUT:
${
  tomorrowsWorkout
    ? `- ${tomorrowsWorkout.workouts.name} (${tomorrowsWorkout.workouts.workout_type}, ${tomorrowsWorkout.workouts.duration_minutes}min, ${tomorrowsWorkout.workouts.tss} TSS)`
    : '- No workout scheduled for tomorrow'
}

TRAINING PLAN:
${hasTrainingPlan ? '✅ Has structured plan in place' : '❌ No structured training plan'}

YOUR TASK:
Give a quick daily check-in covering these 4 things in order:

1. **Greeting + how they're looking** — one warm sentence with their name, one sentence on recovery/fatigue in plain language. Acknowledge a recent ride briefly if relevant.
2. **Sleep/recovery** — if health data exists, one quick comment. If not, ask how they slept (one sentence).
3. **Training** — if they already rode today: acknowledge it, preview tomorrow's workout. If they haven't: tell them what's on the schedule and one coaching cue. If nothing scheduled: one sentence on what to do or that it's a rest day.
4. **Check-in** — one casual question ("How are the legs?"). Do NOT ask "what would you like to do?"

CRITICAL: If ALREADY RODE TODAY = YES, do NOT tell them to do today's scheduled workout. Training is done. Look ahead to tomorrow.

TONE & LENGTH:
- Like a coach texting you — short, direct, friendly
- Use their name once
- NO bold headers — just flowing paragraphs
- NO jargon: never say TSB, CTL, ATL, TSS. Say freshness, fitness, fatigue, training load.
- Reference specific numbers (power, duration) but keep it brief
- TOTAL LENGTH: 4-6 SHORT sentences. Aim for under 100 words. This is a quick check-in, not a report.

EXAMPLE (already rode):

"Good evening ${athlete.full_name || 'there'}! Nice work today — 75 minutes at 190W is solid. You're carrying some fatigue this week so good timing on the endurance effort. How'd you sleep last night? Tomorrow you've got threshold intervals on deck, so fuel up and rest well tonight. How are the legs feeling?"

EXAMPLE (hasn't ridden):

"Good morning ${athlete.full_name || 'there'}! You're well-recovered after yesterday's tempo ride — ready for quality work. How'd you sleep? You've got 4x8min threshold intervals today, 75 minutes total — stay relaxed and focus on holding steady power. Let me know if anything needs adjusting."

Generate the greeting now:`;
  },

  /**
   * Generate AI greeting
   */
  async generateAIGreeting(context: string): Promise<string> {
    try {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 300,
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
