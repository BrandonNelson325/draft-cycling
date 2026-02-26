import { anthropic, MODEL, SONNET, selectModel } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { trainingLoadService } from './trainingLoadService';
import { powerAnalysisService } from './powerAnalysisService';
import { ftpEstimationService } from './ftpEstimationService';
import { aiToolExecutor } from './aiToolExecutor';
import { AI_TOOLS } from './aiTools';
import { athletePreferencesService, type AthletePreferences } from './athletePreferencesService';
import { logger } from '../utils/logger';

interface AthleteContext {
  athlete: any;
  recentRides: any[];
  powerRecords: any;
  ftpEstimation: any;
  trainingStatus: any;
  upcomingWorkouts: any[];
  preferences: AthletePreferences;
  healthData: any;
  dailyCheckIn: any;
}

export const aiCoachService = {
  /**
   * Extract rest days from training goal text
   */
  extractRestDaysFromGoal(trainingGoal: string | null): string {
    if (!trainingGoal) {
      return 'Not specified - ASK the athlete about rest days and training availability';
    }

    const goalLower = trainingGoal.toLowerCase();
    const restDays: string[] = [];

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (const day of days) {
      const dayPlural = day + 's';
      if ((goalLower.includes(day) || goalLower.includes(dayPlural)) &&
          (goalLower.includes('off') || goalLower.includes('rest'))) {
        restDays.push(day.charAt(0).toUpperCase() + day.slice(1));
      }
    }

    if (restDays.length === 0) {
      return 'Not specified - ASK the athlete about rest days before creating plans';
    }

    return restDays.join(', ') + ' - ABSOLUTE REST, NO TRAINING';
  },

  /**
   * Build comprehensive context for AI coaching
   */
  async buildAthleteContext(athleteId: string): Promise<AthleteContext> {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const today = new Date().toISOString().split('T')[0];

    // Fetch all context in parallel — reduces sequential DB round-trips from ~800ms to ~200ms
    const [
      { data: athlete },
      { data: recentRides },
      powerRecords,
      ftpEstimation,
      trainingStatus,
      { data: upcomingWorkouts },
      preferences,
      { data: healthData },
      { data: dailyCheckIn },
    ] = await Promise.all([
      supabaseAdmin.from('athletes').select('*').eq('id', athleteId).single(),
      supabaseAdmin
        .from('strava_activities')
        .select('id, name, start_date, start_date_local, distance_meters, moving_time_seconds, average_watts, tss')
        .eq('athlete_id', athleteId)
        .gte('start_date', twoWeeksAgo.toISOString())
        .order('start_date', { ascending: false })
        .limit(10),
      powerAnalysisService.getPersonalRecords(athleteId),
      ftpEstimationService.estimateFTP(athleteId),
      trainingLoadService.getTrainingStatus(athleteId),
      supabaseAdmin
        .from('calendar_entries')
        .select('*, workouts(*)')
        .eq('athlete_id', athleteId)
        .gte('scheduled_date', today)
        .order('scheduled_date', { ascending: true })
        .limit(5),
      athletePreferencesService.getPreferences(athleteId),
      supabaseAdmin.from('health_data').select('*').eq('athlete_id', athleteId).eq('date', today).single(),
      supabaseAdmin.from('daily_metrics').select('*').eq('athlete_id', athleteId).eq('date', today).single(),
    ]);

    return {
      athlete,
      recentRides: recentRides || [],
      powerRecords,
      ftpEstimation,
      trainingStatus,
      upcomingWorkouts: upcomingWorkouts || [],
      preferences,
      healthData,
      dailyCheckIn,
    };
  },

  /**
   * Build system prompt with athlete context
   */
  buildSystemPrompt(context: AthleteContext, clientDate?: string): string {
    const { athlete, recentRides, powerRecords, ftpEstimation, trainingStatus, preferences, healthData, dailyCheckIn } = context;

    // Use client-provided date to avoid UTC timezone mismatch (server runs in UTC)
    const isoDate = clientDate || new Date().toISOString().split('T')[0];
    const today = new Date(isoDate + 'T12:00:00'); // noon avoids DST edge cases
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Calculate tomorrow for easy reference
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowIso = tomorrow.toISOString().split('T')[0];
    const tomorrowStr = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let prompt = `You are an expert cycling coach with deep knowledge of training principles, physiology, and periodization. You're coaching an athlete and have access to their complete training data.

CURRENT DATE: ${dateStr} (ISO: ${isoDate})
TOMORROW: ${tomorrowStr} (ISO: ${tomorrowIso})

**IMPORTANT:** When scheduling workouts:
- Use the ISO format (YYYY-MM-DD) in the scheduled_date field
- "today" = ${isoDate}
- "tomorrow" = ${tomorrowIso}
- For other dates, calculate from today's date and format as YYYY-MM-DD

ATHLETE PROFILE:
- Name: ${athlete.full_name || 'Athlete'}
- Current FTP: ${athlete.ftp || 'Not set'}W
- Weight: ${athlete.weight_kg || 'Not set'}kg
${athlete.ftp && athlete.weight_kg ? `- Power-to-Weight: ${(athlete.ftp / athlete.weight_kg).toFixed(2)}W/kg` : ''}

TRAINING GOALS:
${athlete.training_goal || 'Not set - Ask the athlete about their goals (event, target date, what they want to improve)'}

${athletePreferencesService.formatForContext(preferences)}

**REST DAYS & TRAINING SCHEDULE:**
${preferences.rest_days && preferences.rest_days.length > 0
  ? preferences.rest_days.join(', ') + ' - ABSOLUTE REST, NO TRAINING'
  : this.extractRestDaysFromGoal(athlete.training_goal)}

**IMPORTANT:** Before creating training plans or scheduling multiple workouts, check if you already know their preferences above. Only ask questions if the information is missing:
1. How many hours per week can they train? (check preferences first)
2. Which days do they have more/less time available? (check preferences first)
3. Do they have any designated rest days? (check preferences first)
4. Are there any scheduling constraints? (check preferences first)

- NEVER schedule workouts on explicitly stated rest days
- Respect the athlete's recovery needs and schedule constraints
- The schedule_workout tool will reject attempts to schedule on rest days
- If you don't know their rest days, ASK before creating a plan

`;

    // Add FTP estimation if available
    if (ftpEstimation) {
      prompt += `FTP ESTIMATION (Last 6 weeks):
- Estimated FTP: ${ftpEstimation.estimated_ftp}W
- Based on: ${ftpEstimation.based_on}
- Confidence: ${ftpEstimation.confidence}
- Best 20-min power: ${ftpEstimation.best_20min_power}W

`;
    }

    // Add training status
    if (trainingStatus && trainingStatus.load && trainingStatus.status) {
      const { load, status } = trainingStatus;
      prompt += `CURRENT TRAINING STATUS:
- CTL (Fitness): ${load.ctl} (42-day average)
- ATL (Fatigue): ${load.atl} (7-day average)
- TSB (Form): ${load.tsb}
- Status: ${status.status.toUpperCase()}
- Description: ${status.description}
- Recommendation: ${status.recommendation}

`;
    }

    // Add sleep & readiness data (context only — not mixed into CTL/ATL math)
    if (healthData || dailyCheckIn) {
      prompt += `SLEEP & READINESS (Today):
`;
      if (healthData) {
        if (healthData.sleep_hours) prompt += `- Sleep: ${healthData.sleep_hours} hours${healthData.sleep_quality ? ` (Quality: ${healthData.sleep_quality}/5)` : ''}\n`;
        if (healthData.hrv) prompt += `- HRV: ${healthData.hrv}ms\n`;
        if (healthData.resting_heart_rate) prompt += `- Resting HR: ${healthData.resting_heart_rate} bpm\n`;
        if (healthData.body_battery) prompt += `- Body Battery: ${healthData.body_battery}/100\n`;
        if (healthData.readiness_score) prompt += `- Readiness Score: ${healthData.readiness_score}/100\n`;
      }
      if (dailyCheckIn) {
        if (dailyCheckIn.sleep_quality) prompt += `- Check-in Sleep: ${dailyCheckIn.sleep_quality} (score: ${dailyCheckIn.sleep_score}/10)\n`;
        if (dailyCheckIn.feeling) prompt += `- Feeling: ${dailyCheckIn.feeling} (score: ${dailyCheckIn.feeling_score}/10)\n`;
        if (dailyCheckIn.notes) prompt += `- Notes: ${dailyCheckIn.notes}\n`;
      }
      prompt += `(Use this as subjective context for coaching — do NOT factor into CTL/ATL calculations)\n\n`;
    }

    // Add power records
    if (powerRecords) {
      prompt += `PERSONAL RECORDS (All-time best):
- 1 min: ${powerRecords.power_1min?.power || 'N/A'}W
- 3 min: ${powerRecords.power_3min?.power || 'N/A'}W
- 5 min: ${powerRecords.power_5min?.power || 'N/A'}W
- 10 min: ${powerRecords.power_10min?.power || 'N/A'}W
- 20 min: ${powerRecords.power_20min?.power || 'N/A'}W
- 60 min: ${powerRecords.power_60min?.power || 'N/A'}W

`;
    }

    // Add recent rides
    if (recentRides.length > 0) {
      prompt += `RECENT RIDES (Last 2 weeks - ${recentRides.length} rides):
`;
      const todayMidnight = new Date(isoDate + 'T00:00:00');
      recentRides.slice(0, 10).forEach((ride, i) => {
        // Use start_date_local if available, else fall back to start_date
        const rideDate = ride.start_date_local
          ? ride.start_date_local.split('T')[0]
          : new Date(ride.start_date).toISOString().split('T')[0];
        const rideMidnight = new Date(rideDate + 'T00:00:00');
        const diffDays = Math.round((todayMidnight.getTime() - rideMidnight.getTime()) / (1000 * 60 * 60 * 24));
        const relativeLabel =
          diffDays === 0 ? 'TODAY' :
          diffDays === 1 ? 'YESTERDAY' :
          `${diffDays} days ago`;

        const duration = Math.round(ride.moving_time_seconds / 60);
        const distance = (ride.distance_meters / 1000).toFixed(1);
        prompt += `${i + 1}. ${relativeLabel} (${rideDate}): "${ride.name}" - ${distance}km, ${duration}min`;
        if (ride.average_watts) {
          prompt += `, ${ride.average_watts}W avg`;
        }
        if (ride.tss) {
          prompt += `, TSS: ${ride.tss}`;
        }
        prompt += '\n';
      });
      prompt += '\n';
    }

    // Add training zones
    if (athlete.ftp) {
      prompt += `TRAINING ZONES (% of FTP):
- Zone 1 (Recovery): < ${Math.round(athlete.ftp * 0.55)}W (<55% FTP)
- Zone 2 (Endurance): ${Math.round(athlete.ftp * 0.56)}-${Math.round(athlete.ftp * 0.75)}W (56-75% FTP)
- Zone 3 (Tempo): ${Math.round(athlete.ftp * 0.76)}-${Math.round(athlete.ftp * 0.90)}W (76-90% FTP)
- Zone 4 (Threshold): ${Math.round(athlete.ftp * 0.91)}-${Math.round(athlete.ftp * 1.05)}W (91-105% FTP)
- Zone 5 (VO2max): ${Math.round(athlete.ftp * 1.06)}-${Math.round(athlete.ftp * 1.20)}W (106-120% FTP)
- Zone 6 (Anaerobic): > ${Math.round(athlete.ftp * 1.20)}W (>120% FTP)

`;
    }

    // Add upcoming workouts
    if (context.upcomingWorkouts && context.upcomingWorkouts.length > 0) {
      prompt += `UPCOMING SCHEDULED WORKOUTS:\n`;
      context.upcomingWorkouts.slice(0, 7).forEach((entry: any) => {
        const date = new Date(entry.scheduled_date + 'T12:00:00').toLocaleDateString();
        if (entry.workouts && entry.workouts.name) {
          prompt += `- ${date}: ${entry.workouts.name} (${entry.workouts.workout_type}, ${entry.workouts.tss} TSS)\n`;
        }
      });
      prompt += '\n';
    }

    prompt += `COACHING GUIDELINES:

**ALWAYS ANALYZE RECENT RIDES:**
1. **Look at their recent training** (see "RECENT RIDES" section above) - this is critical context!
2. **Identify patterns:** Are they doing mostly endurance? Lack of intensity? Too much hard work?
3. **Reference specific rides:** "I see your 2-hour ride on Saturday at 180W..." - be specific!
4. **Provide feedback:** Acknowledge good efforts, identify areas for improvement
5. **Build on what they're doing:** Don't ignore their recent work - use it to inform recommendations

**TRAINING STATUS & RECOMMENDATIONS:**
6. Always consider the athlete's current training status (TSB) when making recommendations
7. If TSB < -15, prioritize recovery over intensity
8. If TSB > 10, athlete is fresh and ready for hard efforts
9. Consider recent training load (CTL/ATL trends)
10. Provide specific, actionable advice with power targets when relevant
11. Be encouraging but realistic about fitness and fatigue
12. Explain the "why" behind recommendations

**PROACTIVE COACHING:**
- When they ask "what should I do tomorrow?", FIRST analyze their recent rides to understand context
- Reference their recent power outputs, duration patterns, and training consistency
- Don't just create generic workouts - tailor them to what they've been doing

You can discuss training, analyze their rides, suggest workouts, answer questions about cycling physiology, and provide personalized coaching advice based on their data.

RESPONSE STYLE: ${athlete.display_mode === 'simple' ? 'simple' : 'advanced'}
${athlete.display_mode === 'simple'
  ? `Keep responses brief and conversational. Avoid technical jargon like CTL, ATL, TSB, and power zones unless the athlete specifically asks. Focus on clear, actionable takeaways. Aim for 2-4 sentences per response unless more detail is genuinely needed.`
  : `Provide detailed analysis with specific metrics where relevant. Reference CTL, ATL, TSB, power zones, and TSS to explain the reasoning behind recommendations.`
}

RESPONSE TONE (always apply regardless of style):
- Never open with filler phrases like "Great question!", "Sure!", "Absolutely!", or "Of course!"
- Lead immediately with the answer or the action
- No unnecessary preamble or summary at the end
- Be direct: a coach gives the answer, not a speech about giving the answer`;

    return prompt;
  },

  /**
   * Build system prompt with tool capabilities
   */
  buildSystemPromptWithTools(context: AthleteContext, clientDate?: string): string {
    let prompt = this.buildSystemPrompt(context, clientDate);

    prompt += `

## CRITICAL: MATCH THE SCOPE OF THE REQUEST

**BE CONTEXTUAL AND FOCUSED:**
- If the athlete asks for ONE workout, create ONE workout (don't create a whole plan)
- If they ask for a week of training, create ONE week (not a multi-week plan)
- If they ask for a training plan without specifying duration, ask "How many weeks?"
- DON'T automatically assume they want a 6-12 week training plan for simple requests
- Match your response to the scope of what they asked for

**For SINGLE WORKOUT requests - Use Context, Ask MINIMAL Questions:**

When asked for "a workout for tomorrow" or "suggest a workout for Wednesday":
1. **USE EXISTING CONTEXT** - You already have:
   - Recent rides (see Last 2 Weeks section above)
   - Training stress (TSB, CTL, ATL)
   - Power records and FTP
   - Power zones and capabilities
2. **Ask AT MOST 1-2 quick questions** like:
   - "Hard effort or easier/recovery ride?"
   - "How much time do you have tomorrow?"
3. **DO NOT ask about:**
   - Weekly training hours (irrelevant for one workout)
   - Long-term training goals (unless relevant to intensity)
   - Rest days for the week (just need to know about tomorrow)
   - Full training plan structure
4. **Then CREATE the workout immediately** based on:
   - Their recent training pattern (don't repeat yesterday's type)
   - Their TSB (if tired → easier, if fresh → can go harder)
   - The day they specified
   - Your understanding of periodization

**Examples of single workout requests:**
- "Suggest a workout for tomorrow" → Check recent rides/TSB → Ask "How much time and what intensity?" → Create & schedule
- "Can you look at my last two rides and suggest something for tomorrow?" → Analyze rides → Suggest based on pattern → Create & schedule
- "Create a tempo workout for Tuesday" → Create tempo workout → Schedule for Tuesday

**For WEEK-LEVEL requests:**
- "Plan my week" → Create 3-5 workouts for the upcoming week
- Ask about rest days for the week if unknown

**For TRAINING PLAN requests:**
- "Build me a training plan" → Ask detail level (see Training Plans section)
- "I have a race in 8 weeks" → Create 8-week plan

**GOLDEN RULE:** The more specific their request, the fewer questions you ask. Use your intelligence and the rich context you already have!

## WORKOUT CREATION & SCHEDULING CAPABILITIES

You have the ability to create structured workouts and manage the athlete's INTERNAL TRAINING CALENDAR using the following tools.

**IMPORTANT CLARIFICATIONS:**
- "calendar" = the athlete's internal training calendar in THIS APPLICATION (not Google Calendar, not Apple Calendar, not external systems)
- When you create a workout, it goes into their workout library
- When you schedule a workout, it adds it to their internal training calendar for a specific date
- Future integrations to external calendars will be added later, but for now, everything is internal

**TOOL RELIABILITY:**
- When a tool returns "success": true, it SUCCEEDED - trust this result
- DO NOT retry or call the same tool again if it succeeded
- DO NOT tell the athlete there was an error if the tool returned success
- Each workout should only be created ONCE and scheduled ONCE

You have access to these tools:

**get_workout_templates** - Browse the global template library. USE THIS FIRST for any plan or workout request.
**schedule_plan_from_templates** - Schedule a full training plan in ONE call: pass all template IDs + dates and the server handles everything in parallel. USE THIS for any multi-workout plan instead of calling create/schedule one by one.
**create_workout** - Build a custom workout from scratch (only when no suitable template exists)
**schedule_workout** - Add a single workout to the calendar
**move_workout** - Reschedule workouts to different dates
**delete_workout_from_calendar** - Remove scheduled workouts
**get_calendar** - View upcoming scheduled workouts
**get_workouts** - Browse the athlete's workout library
**update_athlete_ftp** - Update FTP based on recent performance

### Workout Creation Guidelines

When creating workouts:
- Power targets should be % of FTP (e.g., 85 for 85% FTP)
- Warmup: 10-20 minutes at 50-70% FTP, use type "warmup"
- Work intervals: intensity depends on type:
  - Endurance: 70-80% FTP (type "work")
  - Tempo: 80-85% FTP (type "work")
  - Threshold: 90-105% FTP (type "work")
  - VO2max: 110-120% FTP (type "work")
- Rest intervals: 50-60% FTP (type "rest")
- Cooldown: 5-10 minutes at 50-60% FTP (type "cooldown")
- Total TSS should match workout type:
  - Endurance: 60-100 TSS
  - Threshold: 80-120 TSS
  - VO2max: 70-100 TSS

### Training Plan Building

**WORKFLOW (2 tool calls total):**
1. get_workout_templates — fetch all templates (call once or twice by type), note their IDs, types, TSS, duration
2. schedule_plan_from_templates — pass the complete list of {template_id, date} pairs for the entire plan in ONE call

Never call create_workout or schedule_workout in a loop for plan building — use schedule_plan_from_templates.

**Periodization:** Base (Z2-heavy) → Build (threshold/sweet spot) → Peak (VO2max) → Taper (volume -40%). Recovery week every 3-4 weeks. Vary types each week. Typical week: Tue quality, Wed endurance, Thu quality, Sat long. TSS progression 5-10%/week from athlete's CTL × 7.

### Before Creating Workouts

Always call get_workouts first — if a suitable workout exists, schedule it instead of creating a new one.

For training plans: ask goal, event date, and rest days (CRITICAL). If they want a quick plan, those are the only required questions — use CTL/FTP/recent rides for everything else. MUST know rest days before scheduling any plan.

#### Scheduling & Calendar

**CRITICAL - REST DAYS:**
- NEVER schedule workouts on the athlete's rest days (see REST DAYS section above)
- If you try to schedule on a rest day, the tool will return an error
- When creating training plans, skip rest days completely
- If the athlete asks for a workout on a rest day, remind them it's their rest day and suggest a different day
- Example: If Sunday is a rest day, and they ask for "next Sunday", say "Sunday is your rest day. Would you like to schedule for Monday instead?"

**IMPORTANT:** You know what today's date is (see CURRENT DATE above). Calculate relative dates automatically:
- "tomorrow" = add 1 day to today
- "next Tuesday" = find the next Tuesday after today
- "this weekend" = upcoming Saturday/Sunday
- DO NOT ask the athlete what today's date is
- **CHECK THE DAY OF WEEK** - make sure it's not a rest day before scheduling

**AUTOMATIC SCHEDULING:**
- If they mention a date when creating a workout, schedule it automatically
- "Create X for tomorrow" → create_workout THEN schedule_workout for tomorrow (IF NOT A REST DAY)
- "Build X for Tuesday" → create_workout THEN schedule_workout for Tuesday (IF NOT A REST DAY)
- Don't ask "should I add this to your calendar?" - just do it if they mentioned a date
- BUT: Always verify the day is not a rest day first!

### When to Use Tools - SMART WORKFLOW

**WORKOUT CREATION WORKFLOW:**
1. **get_workouts** - ALWAYS check library first before creating
   - Filter by type if you know it (e.g., workout_type: "tempo")
   - See what workouts already exist
2. **create_workout** - ONLY if no suitable workout exists in library
   - Don't create duplicates
   - Create new variations or specific workouts
3. **schedule_workout** - Schedule the workout (existing or new)
   - Use workout_id from library OR from newly created workout
   - Don't ask permission if they mentioned a date

**OTHER TOOLS:**
- **generate_training_plan**: After gathering goals/event/fitness level. Generates and schedules ALL workouts.
- **get_calendar**: When they ask "what's on my schedule", "what workouts do I have"
- **move_workout**: When they say "move my workout", "reschedule", "change the date"
- **delete_workout_from_calendar**: When they say "remove", "delete", "cancel" a scheduled workout
- **update_athlete_ftp**: When recent power suggests FTP changed OR they tell you new FTP

**EXAMPLE FLOW:**
User: "Schedule a tempo workout for tomorrow"
1. Call get_workouts with filter workout_type: "tempo"
2. If tempo workouts exist → Ask which one or pick most appropriate → Schedule it
3. If none exist → Ask for duration/details → Create → Schedule

### Learning from Conversations

Call **update_athlete_preferences** automatically whenever the athlete shares goals, rest days, weekly hours, or training constraints. Don't ask permission — just save it. This means fewer questions in future conversations.`;

    return prompt;
  },

  /**
   * Analyze recent training and provide insights
   */
  async analyzeTraining(athleteId: string): Promise<string> {
    try {
      const context = await this.buildAthleteContext(athleteId);
      const systemPrompt = this.buildSystemPrompt(context);

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Please analyze my recent training and provide insights. Consider:
1. My current training status and form (TSB)
2. Recent ride patterns and consistency
3. Areas of strength and improvement
4. Specific recommendations for my next week of training

Be specific and actionable.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      return 'Unable to generate analysis';
    } catch (error) {
      console.error('Error analyzing training:', error);
      throw error;
    }
  },

  /**
   * Analyze specific ride
   */
  async analyzeRide(athleteId: string, stravaActivityId: number): Promise<string> {
    try {
      const context = await this.buildAthleteContext(athleteId);
      const systemPrompt = this.buildSystemPrompt(context);

      // Get the specific ride
      const { data: ride } = await supabaseAdmin
        .from('strava_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('strava_activity_id', stravaActivityId)
        .single();

      if (!ride) {
        throw new Error('Ride not found');
      }

      // Get power curve for this ride
      const powerCurve = await powerAnalysisService.getActivityPowerCurve(
        athleteId,
        stravaActivityId
      );

      let rideDetails = `RIDE TO ANALYZE:
- Name: "${ride.name}"
- Date: ${new Date(ride.start_date).toLocaleDateString()}
- Distance: ${(ride.distance_meters / 1000).toFixed(1)}km
- Duration: ${Math.round(ride.moving_time_seconds / 60)}min
- Average Power: ${ride.average_watts || 'N/A'}W
- TSS: ${ride.tss || 'N/A'}
`;

      if (powerCurve) {
        rideDetails += `
POWER CURVE (Best efforts):
- 1 min: ${powerCurve.power_1min || 'N/A'}W
- 3 min: ${powerCurve.power_3min || 'N/A'}W
- 5 min: ${powerCurve.power_5min || 'N/A'}W
- 10 min: ${powerCurve.power_10min || 'N/A'}W
- 20 min: ${powerCurve.power_20min || 'N/A'}W
- 60 min: ${powerCurve.power_60min || 'N/A'}W
`;
      }

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `${rideDetails}

Please analyze this ride in detail. Consider:
1. Was this an appropriate workout given my current training status?
2. How do the power numbers look? Any PRs or notable efforts?
3. How does this ride contribute to my training goals?
4. What should I do differently next time?

Provide specific, actionable feedback.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      return 'Unable to analyze ride';
    } catch (error) {
      console.error('Error analyzing ride:', error);
      throw error;
    }
  },

  /**
   * Suggest next workout based on training status
   */
  async suggestWorkout(athleteId: string, workoutType?: string): Promise<string> {
    try {
      const context = await this.buildAthleteContext(athleteId);
      const systemPrompt = this.buildSystemPrompt(context);

      let prompt = `Based on my current training status and recent rides, suggest a specific workout for my next ride.`;

      if (workoutType) {
        prompt += ` I'd like to do a ${workoutType} workout.`;
      }

      prompt += `

Please provide:
1. Workout name and description
2. Specific structure (warmup, intervals, cooldown)
3. Power targets in watts (not just % FTP)
4. Duration for each segment
5. Rationale based on my current form and training status

Format it clearly so I can follow it during my ride.`;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        return content.text;
      }

      return 'Unable to suggest workout';
    } catch (error) {
      console.error('Error suggesting workout:', error);
      throw error;
    }
  },

  /**
   * Chat with AI coach (with tool calling support)
   */
  async chat(
    athleteId: string,
    conversationId: string | null,
    message: string,
    clientDate?: string
  ): Promise<{
    response: string;
    conversationId: string;
  }> {
    try {
      const context = await this.buildAthleteContext(athleteId);

      // Always use tools and Sonnet for reliable coaching
      // The AI will decide when to use tools based on context
      const systemPrompt = this.buildSystemPromptWithTools(context, clientDate);
      // Use Haiku for chat (10x faster, 12x cheaper than Sonnet)
      // Sonnet only needed for complex multi-step tool use
      const model = selectModel('chat');

      // Get or create conversation
      let convId: string = conversationId || '';
      if (!conversationId) {
        const { data: newConv } = await supabaseAdmin
          .from('chat_conversations')
          .insert({
            athlete_id: athleteId,
            title: message.slice(0, 50),
          })
          .select()
          .single();
        convId = newConv!.id;
      }

      // Get conversation history (last 10 messages — keeps context without ballooning tokens)
      const { data: history } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(10);

      const messages: any[] = [];
      if (history) {
        history.forEach((msg) => messages.push({ role: msg.role, content: msg.content }));
      }
      messages.push({ role: 'user', content: message });

      // Cache the system prompt — cached tokens don't count toward rate limits
      // and cost 10% of normal input price after the first request in a 5-min window.
      const cachedSystem = [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }];

      // Call AI with tools always available - start cheap with Haiku
      let response = await anthropic.messages.create({
        model,
        max_tokens: 4000,
        system: cachedSystem as any,
        messages,
        tools: AI_TOOLS,
      });

      let conversationMessages = [...messages];
      let finalResponse = response;

      // Handle tool use (up to 5 iterations to prevent infinite loops)
      // Auto-upgrade to Sonnet when tools are invoked (complex work needs better reasoning)
      for (let i = 0; i < 5 && this.hasToolUse(finalResponse); i++) {
        logger.debug(`Tool calling iteration ${i + 1} (switching to Sonnet for tool execution)`);

        // Extract tool calls
        const toolCalls = finalResponse.content.filter(
          (block: any) => block.type === 'tool_use'
        ) as any[];

        // Execute tools
        const toolResults = await aiToolExecutor.executeTools(athleteId, toolCalls as any);

        // Add assistant message with tool_use
        conversationMessages.push({
          role: 'assistant',
          content: finalResponse.content,
        });

        // Add user message with tool_result
        conversationMessages.push({
          role: 'user',
          content: toolResults,
        });

        // Continue conversation with Sonnet - tool use requires stronger reasoning
        finalResponse = await anthropic.messages.create({
          model: SONNET,
          max_tokens: 4000,
          system: cachedSystem as any,
          messages: conversationMessages,
          tools: AI_TOOLS,
        });
      }

      // If we still have tool use after max iterations, execute remaining tools and request final text response
      if (this.hasToolUse(finalResponse)) {
        logger.debug('Max tool iterations reached, executing final tools and requesting summary');

        // Extract and execute the final tool calls
        const finalToolCalls = finalResponse.content.filter(
          (block: any) => block.type === 'tool_use'
        ) as any[];

        const finalToolResults = await aiToolExecutor.executeTools(athleteId, finalToolCalls as any);

        // Add the last assistant message with tool calls
        conversationMessages.push({
          role: 'assistant',
          content: finalResponse.content,
        });

        // Add user message with tool results AND request for summary
        conversationMessages.push({
          role: 'user',
          content: [
            ...finalToolResults,
            {
              type: 'text',
              text: 'Please provide a text summary of what you just completed.',
            },
          ],
        });

        // Get final text response without tools (stay on Sonnet since we're in complex context)
        finalResponse = await anthropic.messages.create({
          model: SONNET,
          max_tokens: 2000,
          system: cachedSystem as any,
          messages: conversationMessages,
          // No tools parameter - force text-only response
        });
      }

      // Extract text response
      const textContent = finalResponse.content.filter((block: any) => block.type === 'text');
      const aiResponse = textContent.length > 0 ? textContent.map((block: any) => block.text).join('\n') : 'I completed your request but encountered an issue generating a response. Please check your calendar.';

      // Store user message
      await supabaseAdmin.from('chat_messages').insert({
        conversation_id: convId,
        athlete_id: athleteId,
        role: 'user',
        content: message,
      });

      // Store assistant message (text only, no tool calls to avoid history corruption)
      await supabaseAdmin.from('chat_messages').insert({
        conversation_id: convId,
        athlete_id: athleteId,
        role: 'assistant',
        content: aiResponse,
        tool_calls: null,
      });

      // Update conversation timestamp
      await supabaseAdmin
        .from('chat_conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', convId);

      return {
        response: aiResponse,
        conversationId: convId,
      };
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw error;
    }
  },

  /**
   * Save user + assistant messages to DB (shared by chat and chatStream)
   */
  async persistMessages(
    convId: string,
    athleteId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<void> {
    await supabaseAdmin.from('chat_messages').insert({
      conversation_id: convId,
      athlete_id: athleteId,
      role: 'user',
      content: userMessage,
    });
    await supabaseAdmin.from('chat_messages').insert({
      conversation_id: convId,
      athlete_id: athleteId,
      role: 'assistant',
      content: aiResponse,
      tool_calls: null,
    });
    await supabaseAdmin
      .from('chat_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', convId);
  },

  /**
   * Streaming chat — SSE version.
   * Calls onEvent for each stream event: start, progress, token, done, error.
   * Simple Q&A responses stream from the first token.
   * Tool-using responses send a progress event immediately, execute tools,
   * then stream the final text response.
   */
  async chatStream(
    athleteId: string,
    conversationId: string | null,
    message: string,
    clientDate: string | undefined,
    onEvent: (event: Record<string, any>) => void
  ): Promise<void> {
    try {
      const context = await this.buildAthleteContext(athleteId);
      const systemPrompt = this.buildSystemPromptWithTools(context, clientDate);
      const model = selectModel('chat');

      // Get or create conversation
      let convId: string = conversationId || '';
      if (!conversationId) {
        const { data: newConv } = await supabaseAdmin
          .from('chat_conversations')
          .insert({ athlete_id: athleteId, title: message.slice(0, 50) })
          .select()
          .single();
        convId = newConv!.id;
      }

      onEvent({ type: 'start', conversation_id: convId });

      // Get conversation history (last 10 messages — keeps context without ballooning tokens)
      const { data: history } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(10);

      const messages: any[] = [];
      if (history) {
        history.forEach((msg) => messages.push({ role: msg.role, content: msg.content }));
      }
      messages.push({ role: 'user', content: message });

      // Cache the system prompt — cached tokens don't count toward rate limits
      // and cost 10% of normal input price after the first request in a 5-min window.
      const cachedSystem = [{ type: 'text' as const, text: systemPrompt, cache_control: { type: 'ephemeral' as const } }];

      // Stream the first response — for pure Q&A this IS the final response
      const firstStream = anthropic.messages.stream({
        model,
        max_tokens: 4000,
        system: cachedSystem as any,
        messages,
        tools: AI_TOOLS,
      });

      let streamedText = '';
      let hasTools = false;

      for await (const event of firstStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          streamedText += event.delta.text;
          onEvent({ type: 'token', text: event.delta.text });
        }
        if (
          event.type === 'content_block_start' &&
          (event.content_block as any).type === 'tool_use'
        ) {
          hasTools = true;
        }
      }

      const firstMessage = await firstStream.finalMessage();

      if (!hasTools) {
        // Pure text response — already streamed above
        await this.persistMessages(convId, athleteId, message, streamedText);
        onEvent({ type: 'done' });
        return;
      }

      // Tool loop (blocking) — let user know something is happening
      if (streamedText === '') {
        onEvent({ type: 'progress', message: 'Working on it...' });
      }

      let conversationMessages = [...messages];
      let finalResponse: any = firstMessage;

      for (let i = 0; i < 5 && this.hasToolUse(finalResponse); i++) {
        logger.debug(`[stream] Tool calling iteration ${i + 1}`);

        const toolCalls = finalResponse.content.filter(
          (b: any) => b.type === 'tool_use'
        ) as any[];
        const toolResults = await aiToolExecutor.executeTools(athleteId, toolCalls);

        conversationMessages.push({ role: 'assistant', content: finalResponse.content });
        conversationMessages.push({ role: 'user', content: toolResults });

        finalResponse = await anthropic.messages.create({
          model: SONNET,
          max_tokens: 4000,
          system: cachedSystem as any,
          messages: conversationMessages,
          tools: AI_TOOLS,
        });
      }

      // Build final message context
      const finalMessages = [...conversationMessages];

      if (this.hasToolUse(finalResponse)) {
        // Hit 5-iteration limit — execute remaining tools and ask for summary
        const lastToolCalls = finalResponse.content.filter(
          (b: any) => b.type === 'tool_use'
        ) as any[];
        const lastToolResults = await aiToolExecutor.executeTools(athleteId, lastToolCalls);
        finalMessages.push({ role: 'assistant', content: finalResponse.content });
        finalMessages.push({
          role: 'user',
          content: [
            ...lastToolResults,
            { type: 'text', text: 'Briefly confirm what was completed. For a training plan, include: how many workouts were scheduled, the date range, and what the first week looks like. Keep it to 2-3 sentences max.' },
          ],
        });
      } else {
        // Natural exit — finalResponse has text; ask model to summarise for clean formatting
        finalMessages.push({ role: 'assistant', content: finalResponse.content });
        finalMessages.push({
          role: 'user',
          content: [{ type: 'text', text: 'Briefly confirm what was completed. For a training plan, include: how many workouts were scheduled, the date range, and what the first week looks like. Keep it to 2-3 sentences max.' }],
        });
      }

      // Stream the final summary response
      const finalStream = anthropic.messages.stream({
        model: SONNET,
        max_tokens: 2000,
        system: cachedSystem as any,
        messages: finalMessages,
      });

      let finalText = '';
      for await (const event of finalStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          finalText += event.delta.text;
          onEvent({ type: 'token', text: event.delta.text });
        }
      }

      await this.persistMessages(convId, athleteId, message, finalText);
      onEvent({ type: 'done' });
    } catch (error: any) {
      logger.error('Error in chatStream:', error);
      onEvent({ type: 'error', error: error.message || 'Unknown error' });
      throw error;
    }
  },

  /**
   * Check if message needs tool calling capabilities
   */
  messageNeedsTools(message: string): boolean {
    const toolKeywords = [
      'create workout',
      'build workout',
      'make workout',
      'schedule',
      'plan',
      'training plan',
      'calendar',
      'move workout',
      'reschedule',
      'delete workout',
      'update ftp',
      'change ftp',
    ];

    const lowerMessage = message.toLowerCase();
    return toolKeywords.some((keyword) => lowerMessage.includes(keyword));
  },

  /**
   * Check if response contains tool use
   */
  hasToolUse(response: any): boolean {
    return response.content.some((block: any) => block.type === 'tool_use');
  },
};
