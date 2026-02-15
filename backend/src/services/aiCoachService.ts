import { anthropic, MODEL } from '../utils/anthropic';
import { supabaseAdmin } from '../utils/supabase';
import { trainingLoadService } from './trainingLoadService';
import { powerAnalysisService } from './powerAnalysisService';
import { ftpEstimationService } from './ftpEstimationService';

interface AthleteContext {
  athlete: any;
  recentRides: any[];
  powerRecords: any;
  ftpEstimation: any;
  trainingStatus: any;
  upcomingWorkouts: any[];
}

export const aiCoachService = {
  /**
   * Build comprehensive context for AI coaching
   */
  async buildAthleteContext(athleteId: string): Promise<AthleteContext> {
    // Get athlete profile
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .single();

    // Get recent rides (last 2 weeks)
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const { data: recentRides } = await supabaseAdmin
      .from('strava_activities')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('start_date', twoWeeksAgo.toISOString())
      .order('start_date', { ascending: false })
      .limit(20);

    // Get power records
    const powerRecords = await powerAnalysisService.getPersonalRecords(athleteId);

    // Get FTP estimation
    const ftpEstimation = await ftpEstimationService.estimateFTP(athleteId);

    // Get training status
    const trainingStatus = await trainingLoadService.getTrainingStatus(athleteId);

    // Get upcoming workouts from calendar (if any)
    const { data: upcomingWorkouts } = await supabaseAdmin
      .from('calendar_entries')
      .select('*, workouts(*)')
      .eq('athlete_id', athleteId)
      .gte('scheduled_date', new Date().toISOString().split('T')[0])
      .order('scheduled_date', { ascending: true })
      .limit(7);

    return {
      athlete,
      recentRides: recentRides || [],
      powerRecords,
      ftpEstimation,
      trainingStatus,
      upcomingWorkouts: upcomingWorkouts || [],
    };
  },

  /**
   * Build system prompt with athlete context
   */
  buildSystemPrompt(context: AthleteContext): string {
    const { athlete, recentRides, powerRecords, ftpEstimation, trainingStatus } = context;

    let prompt = `You are an expert cycling coach with deep knowledge of training principles, physiology, and periodization. You're coaching an athlete and have access to their complete training data.

ATHLETE PROFILE:
- Name: ${athlete.full_name || 'Athlete'}
- Current FTP: ${athlete.ftp || 'Not set'}W
- Weight: ${athlete.weight_kg || 'Not set'}kg
${athlete.ftp && athlete.weight_kg ? `- Power-to-Weight: ${(athlete.ftp / athlete.weight_kg).toFixed(2)}W/kg` : ''}

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
      recentRides.slice(0, 10).forEach((ride, i) => {
        const date = new Date(ride.start_date).toLocaleDateString();
        const duration = Math.round(ride.moving_time_seconds / 60);
        const distance = (ride.distance_meters / 1000).toFixed(1);
        prompt += `${i + 1}. ${date}: "${ride.name}" - ${distance}km, ${duration}min`;
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

    prompt += `COACHING GUIDELINES:
1. Always consider the athlete's current training status (TSB) when making recommendations
2. If TSB < -15, prioritize recovery over intensity
3. If TSB > 10, athlete is fresh and ready for hard efforts
4. Consider recent training load (CTL/ATL trends)
5. Provide specific, actionable advice with power targets when relevant
6. Be encouraging but realistic about fitness and fatigue
7. Explain the "why" behind recommendations

You can discuss training, analyze their rides, suggest workouts, answer questions about cycling physiology, and provide personalized coaching advice based on their data.`;

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
   * Chat with AI coach
   */
  async chat(
    athleteId: string,
    conversationId: string | null,
    message: string
  ): Promise<{
    response: string;
    conversationId: string;
  }> {
    try {
      const context = await this.buildAthleteContext(athleteId);
      const systemPrompt = this.buildSystemPrompt(context);

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

      // Get conversation history
      const { data: history } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })
        .limit(20);

      // Build messages array
      const messages: any[] = [];
      if (history) {
        history.forEach((msg) => {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        });
      }

      // Add new user message
      messages.push({
        role: 'user',
        content: message,
      });

      // Get AI response
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages,
      });

      const content = response.content[0];
      const aiResponse = content.type === 'text' ? content.text : 'Unable to generate response';

      // Store messages
      await supabaseAdmin.from('chat_messages').insert([
        {
          conversation_id: convId,
          athlete_id: athleteId,
          role: 'user',
          content: message,
        },
        {
          conversation_id: convId,
          athlete_id: athleteId,
          role: 'assistant',
          content: aiResponse,
        },
      ]);

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
};
