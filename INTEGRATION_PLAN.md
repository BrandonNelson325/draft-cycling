# Integration Plan: Zwift, Garmin & Daily Analysis

## Overview
Three major features to implement before beta launch:
1. Zwift workout sync
2. Garmin bidirectional integration (push workouts + pull health data)
3. Daily morning automated analysis

---

## 1. ZWIFT INTEGRATION

### Problem Statement
Zwift doesn't have a public API for directly uploading workouts. Zwift reads `.zwo` files from local filesystem.

### Zwift File Locations
- **Mac:** `~/Documents/Zwift/Workouts/{zwift_athlete_id}/`
- **Windows:** `Documents\Zwift\Workouts\{zwift_athlete_id}\`
- **iOS/AppleTV:** Not accessible (uses cloud sync from desktop)

### Solution Options

#### Option A: Manual Download (MVP - Implement First) ✅
**Pros:**
- No additional infrastructure
- Works immediately
- Cross-platform

**Cons:**
- Manual process
- User must know Zwift athlete ID
- Must manually place file

**Implementation:**
1. Add Zwift athlete ID field to athlete profile
2. When downloading .zwo, filename format: `{workout_name}_{athlete_id}.zwo`
3. Show instructions: "Save to: Documents/Zwift/Workouts/{YOUR_ID}/"
4. Add "Copy Zwift Path" button to make it easy

#### Option B: Desktop Sync App (v2 - Post Beta)
Small Electron or native app that:
- Authenticates with our API
- Watches for new workouts
- Auto-downloads to Zwift folder
- Runs in system tray

**Not for MVP** - requires additional app distribution, signing, etc.

#### Option C: Cloud Sync via Dropbox/Google Drive
- Upload .zwo to user's Dropbox
- User sets up symlink: `~/Documents/Zwift/Workouts` → Dropbox folder
- Complex setup, not ideal

### MVP Implementation Plan

**Database Changes:**
```sql
ALTER TABLE athletes ADD COLUMN zwift_athlete_id TEXT;
ALTER TABLE athletes ADD COLUMN zwift_auto_sync BOOLEAN DEFAULT FALSE;
```

**Backend:**
- Add `zwift_athlete_id` to athlete profile
- Update .zwo download endpoint to include athlete ID in filename
- Return Zwift folder path in response

**Frontend:**
- Settings page: Add "Zwift Integration" section
  - Input: Zwift Athlete ID
  - Instructions: How to find your Zwift ID (from Zwift Companion app)
  - Toggle: "Auto-name files for Zwift"
- Workout detail page:
  - Download button shows Zwift-formatted filename
  - "Copy Zwift Path" button
  - Instructions modal

**User Flow:**
1. User enters Zwift Athlete ID in settings
2. When downloading workout, filename is automatically: `Sweet_Spot_Intervals.zwo`
3. User copies file to: `~/Documents/Zwift/Workouts/{their_id}/`
4. Workout appears in Zwift's custom workouts

**Future Enhancement (Post-Beta):**
- Desktop sync app (Electron)
- Browser extension to auto-save to local folder

---

## 2. GARMIN INTEGRATION

### Garmin Connect API Overview

**Official API:** https://developer.garmin.com/gc-developer-program/overview/
**Capabilities:**
- Upload workouts to Garmin calendar
- Read activities
- Read health data (sleep, HRV, stress, body battery)
- Read daily summaries

### 2A: Push Workouts to Garmin

**OAuth 2.0 Flow:**
1. Register app at: https://developer.garmin.com/gc-developer-program/
2. Get Client ID and Secret
3. Implement OAuth flow
4. Store access token + refresh token

**API Endpoints:**
- **Upload Workout:** `POST /upload-service/upload/.fit`
- **Schedule Workout:** `POST /workout-service/schedule`
- **Get Workouts:** `GET /workout-service/workouts`

**Implementation:**

```typescript
// Garmin OAuth Flow
1. User clicks "Connect Garmin"
2. Redirect to: https://connect.garmin.com/oauthConfirm
3. User authorizes
4. Garmin redirects back with code
5. Exchange code for access_token + refresh_token
6. Store tokens in database

// Upload Workout
POST https://apis.garmin.com/upload-service/upload/.fit
Headers:
  Authorization: Bearer {access_token}
  Content-Type: application/octet-stream
Body: {fit_file_binary}
```

**Database Schema:**
```sql
-- Add to athletes table
ALTER TABLE athletes ADD COLUMN garmin_access_token TEXT;
ALTER TABLE athletes ADD COLUMN garmin_refresh_token TEXT;
ALTER TABLE athletes ADD COLUMN garmin_token_expires_at TIMESTAMPTZ;
ALTER TABLE athletes ADD COLUMN garmin_user_id TEXT;

-- New table for Garmin health data
CREATE TABLE garmin_health_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Sleep data
  sleep_duration_seconds INTEGER,
  sleep_score INTEGER,
  deep_sleep_seconds INTEGER,
  light_sleep_seconds INTEGER,
  rem_sleep_seconds INTEGER,
  awake_seconds INTEGER,

  -- HRV data
  hrv_avg INTEGER, -- milliseconds
  hrv_morning INTEGER,
  hrv_status TEXT, -- 'balanced', 'unbalanced', 'low', 'high'

  -- Recovery metrics
  body_battery INTEGER, -- 0-100
  stress_level INTEGER, -- 0-100
  resting_heart_rate INTEGER,

  -- Activity readiness (Garmin's metric)
  training_readiness INTEGER, -- 0-100

  -- Raw JSON for future use
  raw_data JSONB,

  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(athlete_id, date)
);

CREATE INDEX idx_garmin_health_athlete_date ON garmin_health_data(athlete_id, date);
```

**Backend Services:**

```typescript
// services/garminService.ts
class GarminService {
  // OAuth
  async getAuthUrl(athleteId: string): Promise<string>
  async handleCallback(code: string, athleteId: string): Promise<void>
  async refreshToken(athleteId: string): Promise<void>

  // Workout Management
  async uploadWorkout(athleteId: string, fitFile: Buffer): Promise<string>
  async scheduleWorkout(athleteId: string, workoutId: string, date: Date): Promise<void>
  async deleteWorkout(athleteId: string, garminWorkoutId: string): Promise<void>

  // Health Data (Pull)
  async syncHealthData(athleteId: string, startDate: Date, endDate: Date): Promise<void>
  async getSleepData(athleteId: string, date: Date): Promise<SleepData>
  async getHRVData(athleteId: string, date: Date): Promise<HRVData>
  async getBodyBattery(athleteId: string, date: Date): Promise<BodyBatteryData>
  async getDailySummary(athleteId: string, date: Date): Promise<DailySummary>
}
```

**Key Garmin API Endpoints:**

```typescript
// Health Data
GET /wellness-api/rest/dailies?uploadStartTimeInSeconds={start}&uploadEndTimeInSeconds={end}
// Returns: sleep, steps, calories, heart rate

GET /wellness-api/rest/heartRate/daily/{date}
// Returns: resting HR, max HR, HRV

GET /wellness-api/rest/bodyBattery/daily/{date}
// Returns: body battery throughout day

GET /wellness-api/rest/stress/daily/{date}
// Returns: stress levels throughout day
```

### 2B: Pull Health Data from Garmin

**Daily Sync Strategy:**
- Run sync job every 6 hours
- Fetch last 7 days of data
- Store in `garmin_health_data` table
- Update metrics when new data arrives

**Sync Job:**
```typescript
// Background job (cron)
async function syncGarminHealthData() {
  // Get all athletes with Garmin connected
  const athletes = await getAthletesWithGarmin();

  for (const athlete of athletes) {
    try {
      // Sync last 7 days
      const endDate = new Date();
      const startDate = subDays(endDate, 7);

      await garminService.syncHealthData(athlete.id, startDate, endDate);
    } catch (error) {
      console.error(`Failed to sync Garmin data for athlete ${athlete.id}:`, error);
    }
  }
}
```

**Integration with AI Coach:**

Update `buildAthleteContext` to include Garmin health data:

```typescript
// Get recent Garmin health data
const { data: healthData } = await supabaseAdmin
  .from('garmin_health_data')
  .select('*')
  .eq('athlete_id', athleteId)
  .gte('date', sevenDaysAgo)
  .order('date', { ascending: false });

// Add to context
context.healthData = healthData;

// In system prompt:
RECENT HEALTH DATA (from Garmin):
${healthData.map(d => `
Date: ${d.date}
- Sleep: ${d.sleep_duration_seconds / 3600}h (Score: ${d.sleep_score}/100)
- HRV: ${d.hrv_avg}ms (Status: ${d.hrv_status})
- Body Battery: ${d.body_battery}/100
- Stress Level: ${d.stress_level}/100
- Resting HR: ${d.resting_heart_rate}bpm
- Training Readiness: ${d.training_readiness}/100
`).join('\n')}

**USE THIS DATA TO:**
- Assess recovery status
- Recommend easier workouts if Body Battery is low
- Suggest rest days if HRV is low or sleep was poor
- Increase intensity if metrics show full recovery
```

**Frontend Components:**

1. **Settings Page - Garmin Connection**
   - "Connect Garmin" button → OAuth flow
   - Display connection status
   - Show last sync time
   - "Disconnect" button

2. **Dashboard - Health Metrics Card** (new)
   - Display today's health metrics
   - HRV trend graph
   - Sleep quality indicator
   - Body Battery gauge
   - Training readiness score

3. **Workout Auto-Sync Toggle**
   - "Automatically send scheduled workouts to Garmin"
   - Runs when workout is scheduled to calendar

---

## 3. DAILY MORNING ANALYSIS

### Overview
Every morning at 6 AM (athlete's local time), automatically:
1. Analyze all available data
2. Suggest workout modifications if needed
3. Send notification/summary

### Implementation Strategy

**Cron Job Schedule:**
```typescript
// Run every hour, but check each athlete's timezone
cron.schedule('0 * * * *', async () => {
  await runDailyAnalysisForDueAthletes();
});

async function runDailyAnalysisForDueAthletes() {
  const currentHour = new Date().getUTCHours();

  // Get athletes whose local time is 6 AM right now
  const athletes = await getAthletesDueForAnalysis(currentHour);

  for (const athlete of athletes) {
    await runDailyAnalysis(athlete.id);
  }
}
```

**Database Schema:**
```sql
-- Add timezone to athletes
ALTER TABLE athletes ADD COLUMN timezone TEXT DEFAULT 'America/Los_Angeles';
ALTER TABLE athletes ADD COLUMN daily_analysis_time TIME DEFAULT '06:00:00';
ALTER TABLE athletes ADD COLUMN daily_analysis_enabled BOOLEAN DEFAULT TRUE;

-- New table for daily analysis results
CREATE TABLE daily_analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Analysis results
  recommendation TEXT NOT NULL, -- 'keep_scheduled', 'make_easier', 'make_harder', 'rest_day'
  rationale TEXT NOT NULL,

  -- Data used in analysis
  yesterday_tss INTEGER,
  yesterday_duration_minutes INTEGER,
  sleep_score INTEGER,
  hrv_status TEXT,
  body_battery INTEGER,
  current_tsb DECIMAL(5,2),

  -- Scheduled workout
  scheduled_workout_id UUID REFERENCES workouts(id),
  scheduled_workout_name TEXT,
  scheduled_workout_tss INTEGER,

  -- Suggested modification
  suggested_workout_id UUID REFERENCES workouts(id),
  modification_applied BOOLEAN DEFAULT FALSE,

  -- AI response
  ai_summary TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(athlete_id, date)
);

CREATE INDEX idx_daily_analyses_athlete_date ON daily_analyses(athlete_id, date);
```

**Analysis Service:**

```typescript
// services/dailyAnalysisService.ts
class DailyAnalysisService {
  async runDailyAnalysis(athleteId: string): Promise<DailyAnalysis> {
    // 1. Gather all data
    const context = await this.buildAnalysisContext(athleteId);

    // 2. Get AI recommendation
    const analysis = await this.getAIRecommendation(context);

    // 3. Store result
    const result = await this.storeAnalysis(athleteId, analysis);

    // 4. Apply modification if recommended and athlete has auto-adjust enabled
    if (analysis.recommendation !== 'keep_scheduled' && athlete.auto_adjust_workouts) {
      await this.applyWorkoutModification(athleteId, analysis);
    }

    // 5. Send notification
    await this.sendNotification(athleteId, result);

    return result;
  }

  private async buildAnalysisContext(athleteId: string) {
    const yesterday = subDays(new Date(), 1);

    return {
      // Yesterday's activities
      yesterdayRides: await getActivities(athleteId, yesterday, yesterday),

      // Health data
      healthData: await garminService.getDailySummary(athleteId, yesterday),

      // Current fitness
      trainingStatus: await trainingLoadService.getTrainingStatus(athleteId),

      // Today's scheduled workout
      scheduledWorkout: await calendarService.getWorkoutForDate(athleteId, new Date()),

      // Recent pattern (last 7 days)
      recentActivities: await getActivities(athleteId, subDays(new Date(), 7), new Date()),
    };
  }

  private async getAIRecommendation(context: AnalysisContext): Promise<Recommendation> {
    const prompt = this.buildAnalysisPrompt(context);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4',
      max_tokens: 2000,
      system: prompt,
      messages: [{
        role: 'user',
        content: 'Analyze the data and provide your recommendation for today\'s workout.',
      }],
    });

    return this.parseRecommendation(response);
  }

  private buildAnalysisPrompt(context: AnalysisContext): string {
    return `You are analyzing an athlete's readiness for today's scheduled workout.

YESTERDAY'S TRAINING:
${context.yesterdayRides.map(r => `- ${r.name}: ${r.duration}min, ${r.tss} TSS, ${r.average_watts}W`).join('\n')}
Total TSS: ${sum(context.yesterdayRides.map(r => r.tss))}

HEALTH DATA (from Garmin):
- Sleep: ${context.healthData.sleep_duration}h (Score: ${context.healthData.sleep_score}/100)
- HRV: ${context.healthData.hrv_avg}ms (${context.healthData.hrv_status})
- Body Battery: ${context.healthData.body_battery}/100
- Stress: ${context.healthData.stress_level}/100
- Resting HR: ${context.healthData.resting_heart_rate}bpm
- Training Readiness: ${context.healthData.training_readiness}/100

CURRENT FITNESS:
- TSB (Form): ${context.trainingStatus.tsb}
- CTL (Fitness): ${context.trainingStatus.ctl}
- ATL (Fatigue): ${context.trainingStatus.atl}

SCHEDULED FOR TODAY:
${context.scheduledWorkout ? `
- Workout: ${context.scheduledWorkout.name}
- Type: ${context.scheduledWorkout.workout_type}
- Duration: ${context.scheduledWorkout.duration_minutes}min
- TSS: ${context.scheduledWorkout.tss}
` : 'No workout scheduled'}

RECENT 7-DAY PATTERN:
${context.recentActivities.map(a => `- ${formatDate(a.date)}: ${a.tss} TSS`).join('\n')}

YOUR TASK:
Analyze all data and provide ONE of these recommendations:
1. **keep_scheduled** - Athlete is recovered and ready for planned workout
2. **make_easier** - Athlete shows fatigue, reduce intensity or duration
3. **make_harder** - Athlete is very fresh, could handle more
4. **rest_day** - Clear signs of overtraining, recommend complete rest

DECISION CRITERIA:
- Body Battery < 25 OR HRV status = 'low' OR Sleep < 5h → Likely needs easier day or rest
- Body Battery > 75 AND HRV status = 'balanced/high' AND Sleep > 7h → Can handle scheduled workout
- TSB < -30 (very fatigued) → Consider easier day
- TSB > 10 (very fresh) → Could handle more

Provide:
1. Recommendation (one of the 4 options above)
2. Clear rationale (2-3 sentences)
3. Specific suggestion if modification needed

Format response as JSON:
{
  "recommendation": "keep_scheduled|make_easier|make_harder|rest_day",
  "rationale": "Clear explanation",
  "suggestion": "Specific workout suggestion if modification needed"
}`;
  }
}
```

**Auto-Adjustment Logic:**

```typescript
private async applyWorkoutModification(
  athleteId: string,
  analysis: Recommendation
): Promise<void> {
  const todayEntry = await calendarService.getWorkoutForDate(athleteId, new Date());

  if (!todayEntry) return;

  switch (analysis.recommendation) {
    case 'make_easier':
      // Reduce TSS by 30%
      const easierWorkout = await this.createEasierVersion(todayEntry.workout);
      await calendarService.updateEntry(todayEntry.id, { workout_id: easierWorkout.id });
      break;

    case 'make_harder':
      // Increase TSS by 20%
      const harderWorkout = await this.createHarderVersion(todayEntry.workout);
      await calendarService.updateEntry(todayEntry.id, { workout_id: harderWorkout.id });
      break;

    case 'rest_day':
      // Replace with recovery ride
      const recoveryWorkout = await this.getOrCreateRecoveryRide(athleteId);
      await calendarService.updateEntry(todayEntry.id, { workout_id: recoveryWorkout.id });
      break;
  }
}
```

**Frontend Components:**

1. **Daily Analysis Card** (Dashboard)
   - Shows today's analysis
   - "Your body is well-recovered. Ready for today's workout!"
   - Or: "You seem fatigued. I've modified today's workout to be easier."
   - Click to see full analysis

2. **Analysis History Page**
   - Calendar view of past analyses
   - Trends: how often workouts were modified
   - Correlations: sleep quality vs workout performance

3. **Settings - Daily Analysis**
   - Toggle: Enable daily analysis
   - Time picker: When to run (default 6 AM)
   - Toggle: Auto-adjust workouts
   - Toggle: Send notifications

**Notification System:**

```typescript
// services/notificationService.ts
async function sendDailyAnalysisNotification(
  athleteId: string,
  analysis: DailyAnalysis
) {
  const athlete = await getAthlete(athleteId);

  // Email
  if (athlete.email_notifications_enabled) {
    await sendEmail({
      to: athlete.email,
      subject: `Your Daily Training Analysis - ${formatDate(new Date())}`,
      html: renderAnalysisEmail(analysis),
    });
  }

  // Push notification (if implemented)
  if (athlete.push_notifications_enabled) {
    await sendPushNotification({
      userId: athleteId,
      title: 'Daily Training Analysis',
      body: analysis.rationale,
    });
  }

  // In-app notification
  await createInAppNotification({
    athleteId,
    type: 'daily_analysis',
    title: 'Daily Analysis Ready',
    message: analysis.rationale,
    link: `/analysis/${analysis.id}`,
  });
}
```

---

## IMPLEMENTATION ORDER

### Phase 1: Zwift (1-2 days)
1. ✅ Add zwift_athlete_id to database
2. ✅ Update profile settings UI
3. ✅ Update .zwo download to use Zwift naming
4. ✅ Add "Copy Path" helper
5. ✅ Add instructions modal

### Phase 2: Garmin - Workout Push (3-4 days)
1. Register with Garmin Developer Program
2. Implement OAuth flow (backend)
3. Implement OAuth flow (frontend)
4. Create garminService
5. Upload .fit files to Garmin
6. Test with real Garmin account

### Phase 3: Garmin - Health Data Pull (3-4 days)
1. Add garmin_health_data table
2. Implement health data sync (sleep, HRV, body battery)
3. Create sync cron job
4. Update AI coach context with health data
5. Build dashboard health metrics card

### Phase 4: Daily Analysis (3-4 days)
1. Add daily_analyses table
2. Create dailyAnalysisService
3. Implement AI analysis logic
4. Create cron job for scheduled runs
5. Build frontend components
6. Implement notifications

### Phase 5: Testing & Polish (2-3 days)
1. End-to-end testing
2. Error handling
3. User documentation
4. Beta tester onboarding guide

**Total Time: ~14-18 days**

---

## QUESTIONS TO ANSWER BEFORE IMPLEMENTATION

1. **Garmin Developer Account:**
   - Do you already have a Garmin developer account?
   - Need to request API access (can take 1-2 weeks for approval)

2. **Notification Preferences:**
   - Email only, or also implement push notifications?
   - SMS notifications?

3. **Auto-Adjustment:**
   - Should daily analysis auto-adjust workouts by default, or require opt-in?
   - How aggressive should modifications be?

4. **Data Retention:**
   - How long to keep health data? (GDPR compliance)
   - Delete after 90 days? 1 year?

5. **Fallback Behavior:**
   - If Garmin sync fails, what should happen?
   - If no health data available, skip analysis or use workout data only?

---

## RISK MITIGATION

1. **Garmin API Rate Limits:**
   - Implement rate limiting in our code
   - Queue requests if needed
   - Cache frequently accessed data

2. **Token Expiration:**
   - Implement automatic token refresh
   - Handle refresh failures gracefully
   - Prompt user to reconnect if refresh fails

3. **Data Privacy:**
   - Encrypt health data at rest
   - Clear GDPR compliance
   - User can delete all health data

4. **Sync Failures:**
   - Retry logic with exponential backoff
   - Store failed sync jobs for manual review
   - Alert user if sync hasn't worked in 3+ days

5. **Analysis Errors:**
   - Fallback to simple rule-based if AI fails
   - Don't auto-adjust if confidence is low
   - Log all decisions for debugging

---

## SUCCESS METRICS

1. **Zwift Integration:**
   - % of users who enter Zwift ID
   - # of workouts downloaded

2. **Garmin Integration:**
   - % of users who connect Garmin
   - Health data sync success rate
   - # of workouts pushed to Garmin

3. **Daily Analysis:**
   - % of users who enable daily analysis
   - Workout modification frequency
   - User satisfaction with recommendations

4. **Overall:**
   - Beta tester retention
   - Feature usage rates
   - Bug reports / critical issues
