# Wahoo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to push structured workouts to their Wahoo ELEMNT head units via the Wahoo Cloud API.

**Architecture:** OAuth 2.0 connection stores tokens on the athlete row. When workouts are scheduled, a `.plan` file is generated from the internal intervals format and uploaded via the Wahoo Plans + Workouts API. Auto-sync and manual sync both supported, tracked via the existing `workout_syncs` table.

**Tech Stack:** TypeScript, Express, Supabase, axios, React, React Native (Expo)

**Spec:** `docs/superpowers/specs/2026-03-27-wahoo-integration-design.md`

---

### Task 1: Database Migration

**Files:**
- Create: `backend/migrations/024_wahoo_integration.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add Wahoo integration columns to athletes table
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_user_id TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_access_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_refresh_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_token_expires_at TIMESTAMPTZ;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_auto_sync BOOLEAN DEFAULT FALSE;

-- Add 'wahoo' to workout_syncs integration check constraint
ALTER TABLE workout_syncs DROP CONSTRAINT IF EXISTS workout_syncs_integration_check;
ALTER TABLE workout_syncs ADD CONSTRAINT workout_syncs_integration_check
  CHECK (integration IN ('intervals_icu', 'garmin', 'trainingpeaks', 'wahoo'));
```

- [ ] **Step 2: Commit**

```bash
git add backend/migrations/024_wahoo_integration.sql
git commit -m "feat: add Wahoo integration migration (024)"
```

**Note:** Run this migration in the Supabase SQL editor before testing.

---

### Task 2: Wahoo Plan File Generator

**Files:**
- Create: `backend/src/services/wahooPlanGenerator.ts`

- [ ] **Step 1: Create the generator**

```typescript
import type { Workout, WorkoutInterval } from '../types/workout';

/**
 * Generate a Wahoo .plan file from a workout definition.
 * Wahoo uses a text-based format with =HEADER= and =STREAM= sections.
 */
export function generateWahooPlan(workout: Workout, athleteFtp: number): string {
  const totalDuration = workout.intervals.reduce((sum, i) => {
    const reps = i.repeat || 1;
    return sum + i.duration * reps;
  }, 0);

  const lines: string[] = [
    '=HEADER=',
    `NAME=${workout.name}`,
    `DESCRIPTION=${(workout.description || '').replace(/\n/g, ' ')}`,
    `DURATION=${totalDuration}`,
    `FTP=${athleteFtp}`,
    'PLAN_TYPE=0',
    'WORKOUT_TYPE=0',
    '',
    '=STREAM=',
  ];

  for (const interval of workout.intervals) {
    if (interval.type === 'ramp') {
      // Wahoo doesn't support ramps — convert to stepped intervals
      const steps = rampToSteps(interval);
      for (const step of steps) {
        lines.push(...formatInterval(step));
      }
    } else {
      const reps = interval.repeat || 1;
      if (reps > 1) {
        // Emit the interval once with REPEAT
        lines.push(...formatInterval(interval, reps));
      } else {
        lines.push(...formatInterval(interval));
      }
    }
  }

  return lines.join('\n');
}

function formatInterval(interval: WorkoutInterval, repeat?: number): string[] {
  const name = intervalTypeName(interval.type);
  const power = interval.power || 50;

  const lines = [
    '=INTERVAL=',
    `INTERVAL_NAME=${name}`,
    `PERCENT_FTP_LO=${Math.max(0, power - 2)}`,
    `PERCENT_FTP_HI=${power + 2}`,
    `MESG_DURATION_SEC>${interval.duration}`,
  ];

  if (interval.cadence) {
    lines.push(`CAD_LO=${Math.max(0, interval.cadence - 5)}`);
    lines.push(`CAD_HI=${interval.cadence + 5}`);
  }

  if (repeat && repeat > 1) {
    lines.push(`REPEAT=${repeat}`);
  }

  lines.push('');
  return lines;
}

/**
 * Convert a ramp interval into 4 equal stepped intervals.
 */
function rampToSteps(interval: WorkoutInterval): WorkoutInterval[] {
  const low = interval.power_low || 50;
  const high = interval.power_high || 100;
  const stepCount = 4;
  const stepDuration = Math.round(interval.duration / stepCount);
  const steps: WorkoutInterval[] = [];

  for (let i = 0; i < stepCount; i++) {
    const fraction = i / (stepCount - 1);
    const power = Math.round(low + (high - low) * fraction);
    steps.push({
      duration: stepDuration,
      power,
      type: interval.type === 'ramp' ? 'work' : interval.type,
    });
  }

  return steps;
}

function intervalTypeName(type: string): string {
  switch (type) {
    case 'warmup': return 'Warm Up';
    case 'cooldown': return 'Cool Down';
    case 'work': return 'Work';
    case 'rest': return 'Recovery';
    default: return 'Work';
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/wahooPlanGenerator.ts
git commit -m "feat: add Wahoo .plan file generator"
```

---

### Task 3: Wahoo Service — OAuth + Token Management

**Files:**
- Create: `backend/src/services/wahooService.ts`

- [ ] **Step 1: Create the service with OAuth methods**

```typescript
import axios from 'axios';
import { supabaseAdmin } from '../utils/supabase';
import { generateWahooPlan } from './wahooPlanGenerator';
import { logger } from '../utils/logger';

const WAHOO_API_URL = 'https://api.wahooligan.com/v1';
const WAHOO_OAUTH_URL = 'https://api.wahooligan.com/oauth';

interface WahooConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  mobileRedirectUri: string;
}

class WahooService {
  private config: WahooConfig;

  constructor() {
    this.config = {
      clientId: process.env.WAHOO_CLIENT_ID || '',
      clientSecret: process.env.WAHOO_CLIENT_SECRET || '',
      redirectUri: process.env.WAHOO_REDIRECT_URI || 'http://localhost:3001/api/integrations/wahoo/callback',
      mobileRedirectUri: process.env.WAHOO_MOBILE_REDIRECT_URI || 'cyclingcoach://wahoo/callback',
    };
  }

  /**
   * Get OAuth authorization URL
   * When mobile=true, embed ':mobile' in state so the callback knows to redirect to the app deep link.
   */
  getAuthUrl(state?: string, mobile?: boolean): string {
    const fullState = mobile ? `${state || ''}:mobile` : (state || '');
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: this.config.redirectUri,
      scope: 'workouts_write plans_write user_read',
      state: fullState,
    });

    return `${WAHOO_OAUTH_URL}/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async handleCallback(code: string, athleteId: string): Promise<void> {
    try {
      const response = await axios.post(
        `${WAHOO_OAUTH_URL}/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      // Fetch Wahoo user profile to get user ID
      let wahooUserId: string | null = null;
      try {
        const userResp = await axios.get(`${WAHOO_API_URL}/user`, {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        wahooUserId = userResp.data?.id?.toString() || null;
      } catch {
        logger.warn('Could not fetch Wahoo user profile, proceeding without user ID');
      }

      const { error } = await supabaseAdmin
        .from('athletes')
        .update({
          wahoo_access_token: access_token,
          wahoo_refresh_token: refresh_token,
          wahoo_token_expires_at: expiresAt.toISOString(),
          wahoo_user_id: wahooUserId,
          wahoo_auto_sync: true,
        })
        .eq('id', athleteId);

      if (error) {
        throw new Error(`Failed to store Wahoo tokens: ${error.message}`);
      }

      logger.info(`Wahoo connected for athlete ${athleteId}`);
    } catch (error: any) {
      logger.error('Wahoo OAuth callback error:', error.response?.data || error.message);
      throw new Error('Failed to connect Wahoo account');
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_refresh_token')
      .eq('id', athleteId)
      .single();

    if (!athlete?.wahoo_refresh_token) {
      throw new Error('No Wahoo refresh token found');
    }

    try {
      const response = await axios.post(
        `${WAHOO_OAUTH_URL}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: athlete.wahoo_refresh_token,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }).toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;

      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      await supabaseAdmin
        .from('athletes')
        .update({
          wahoo_access_token: access_token,
          wahoo_refresh_token: refresh_token || athlete.wahoo_refresh_token,
          wahoo_token_expires_at: expiresAt.toISOString(),
        })
        .eq('id', athleteId);

      return access_token;
    } catch (error: any) {
      logger.error('Wahoo token refresh failed:', error.response?.data || error.message);
      throw new Error('Failed to refresh Wahoo token');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_access_token, wahoo_token_expires_at')
      .eq('id', athleteId)
      .single();

    if (!athlete?.wahoo_access_token) {
      throw new Error('Wahoo not connected');
    }

    const expiresAt = new Date(athlete.wahoo_token_expires_at);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt < fiveMinutesFromNow) {
      return await this.refreshToken(athleteId);
    }

    return athlete.wahoo_access_token;
  }

  /**
   * Upload workout to Wahoo (create plan + schedule workout)
   */
  async uploadWorkout(
    athleteId: string,
    workoutId: string,
    scheduledDate: Date,
    calendarEntryId?: string
  ): Promise<string> {
    try {
      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', athleteId)
        .single();

      if (!athlete?.ftp) {
        throw new Error('Athlete FTP not set');
      }

      const { data: workout } = await supabaseAdmin
        .from('workouts')
        .select('*')
        .eq('id', workoutId)
        .single();

      if (!workout) {
        throw new Error('Workout not found');
      }

      // Generate .plan file
      const planContent = generateWahooPlan(workout, athlete.ftp);
      const base64Plan = Buffer.from(planContent).toString('base64');

      const accessToken = await this.getAccessToken(athleteId);

      // Step 1: Create plan
      const planResponse = await axios.post(
        `${WAHOO_API_URL}/plans`,
        new URLSearchParams({
          'plan[file]': `data:application/json;base64,${base64Plan}`,
          'plan[filename]': `${workout.name.replace(/\s+/g, '_')}.plan`,
          'plan[external_id]': workoutId,
          'plan[provider_updated_at]': new Date().toISOString(),
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const planId = planResponse.data?.id;

      // Step 2: Create workout (scheduled instance)
      const startsUtc = scheduledDate.toISOString();
      const workoutResponse = await axios.post(
        `${WAHOO_API_URL}/workouts`,
        new URLSearchParams({
          'workout[name]': workout.name,
          'workout[workout_type_id]': '40', // 40 = bike
          'workout[starts]': startsUtc,
          'workout[minutes]': workout.duration_minutes.toString(),
          'workout[plan_id]': planId?.toString() || '',
        }).toString(),
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const wahooWorkoutId = workoutResponse.data?.id;

      // Record sync
      await supabaseAdmin.from('workout_syncs').upsert({
        workout_id: workoutId,
        athlete_id: athleteId,
        calendar_entry_id: calendarEntryId || null,
        integration: 'wahoo',
        external_id: wahooWorkoutId?.toString() || planId?.toString(),
        sync_status: 'synced',
        last_synced_at: new Date().toISOString(),
      });

      logger.info(`Workout synced to Wahoo: ${workout.name}`);
      return wahooWorkoutId || planId;
    } catch (error: any) {
      logger.error('Failed to upload workout to Wahoo:', error.response?.data || error.message);

      await supabaseAdmin.from('workout_syncs').upsert({
        workout_id: workoutId,
        athlete_id: athleteId,
        calendar_entry_id: calendarEntryId || null,
        integration: 'wahoo',
        sync_status: 'failed',
        sync_error: error.response?.data?.error || error.message,
        last_synced_at: new Date().toISOString(),
      });

      throw new Error('Failed to sync workout to Wahoo');
    }
  }

  /**
   * Delete workout from Wahoo
   */
  async deleteWorkout(athleteId: string, externalId: string): Promise<void> {
    try {
      const accessToken = await this.getAccessToken(athleteId);
      await axios.delete(`${WAHOO_API_URL}/workouts/${externalId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Update sync record
      await supabaseAdmin
        .from('workout_syncs')
        .update({ sync_status: 'deleted', last_synced_at: new Date().toISOString() })
        .eq('external_id', externalId)
        .eq('integration', 'wahoo')
        .eq('athlete_id', athleteId);

      logger.info(`Workout deleted from Wahoo: ${externalId}`);
    } catch (error: any) {
      logger.error('Failed to delete workout from Wahoo:', error.response?.data || error.message);
      throw new Error('Failed to delete workout from Wahoo');
    }
  }

  /**
   * Disconnect Wahoo
   */
  async disconnect(athleteId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({
        wahoo_access_token: null,
        wahoo_refresh_token: null,
        wahoo_token_expires_at: null,
        wahoo_user_id: null,
        wahoo_auto_sync: false,
      })
      .eq('id', athleteId);

    if (error) {
      throw new Error(`Failed to disconnect Wahoo: ${error.message}`);
    }
  }

  /**
   * Check if athlete has Wahoo connected
   */
  async isConnected(athleteId: string): Promise<boolean> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_access_token')
      .eq('id', athleteId)
      .single();

    return !!athlete?.wahoo_access_token;
  }
}

export const wahooService = new WahooService();
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/wahooService.ts
git commit -m "feat: add Wahoo service with OAuth, upload, and token management"
```

---

### Task 4: Routes & Controller

**Files:**
- Modify: `backend/src/controllers/integrationsController.ts`
- Modify: `backend/src/routes/integrationsRoutes.ts`

- [ ] **Step 1: Add Wahoo controller methods to `integrationsController.ts`**

Add import at top:

```typescript
import { wahooService } from '../services/wahooService';
```

Add these methods at the bottom of the file (mirror the Intervals.icu methods exactly):

```typescript
/**
 * Wahoo Integration Controllers
 */

export const getWahooAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const state = req.user.id;
    const mobile = req.query.mobile === 'true';
    const authUrl = wahooService.getAuthUrl(state, mobile);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Error generating Wahoo auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
};

export const handleWahooCallback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== 'string') { res.status(400).json({ error: 'Missing authorization code' }); return; }
    if (!state || typeof state !== 'string') { res.status(400).json({ error: 'Missing state parameter' }); return; }

    // Parse mobile flag from state (format: "athleteId:mobile")
    const isMobile = state.includes(':mobile');
    const athleteId = state.replace(':mobile', '');

    await wahooService.handleCallback(code, athleteId);

    if (isMobile) {
      res.redirect(`cyclingcoach://wahoo/callback?status=connected`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/settings?wahoo=connected`);
    }
  } catch (error: any) {
    console.error('Wahoo callback error:', error);
    const isMobile = (req.query.state as string)?.includes(':mobile');
    if (isMobile) {
      res.redirect(`cyclingcoach://wahoo/callback?status=error`);
    } else {
      res.redirect(`${process.env.FRONTEND_URL}/settings?wahoo=error`);
    }
  }
};

export const disconnectWahoo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    await wahooService.disconnect(req.user.id);
    res.json({ success: true, message: 'Wahoo disconnected' });
  } catch (error: any) {
    console.error('Error disconnecting Wahoo:', error);
    res.status(500).json({ error: 'Failed to disconnect Wahoo' });
  }
};

export const getWahooStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('wahoo_user_id, wahoo_access_token, wahoo_auto_sync, wahoo_token_expires_at')
      .eq('id', req.user.id)
      .single();
    res.json({
      connected: !!athlete?.wahoo_access_token,
      user_id: athlete?.wahoo_user_id,
      auto_sync: athlete?.wahoo_auto_sync || false,
      token_expires_at: athlete?.wahoo_token_expires_at,
    });
  } catch (error: any) {
    console.error('Error getting Wahoo status:', error);
    res.status(500).json({ error: 'Failed to get integration status' });
  }
};

export const syncWorkoutToWahoo = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { workout_id, scheduled_date, calendar_entry_id } = req.body;
    if (!workout_id || !scheduled_date) { res.status(400).json({ error: 'workout_id and scheduled_date are required' }); return; }
    const externalId = await wahooService.uploadWorkout(req.user.id, workout_id, new Date(scheduled_date), calendar_entry_id);
    res.json({ success: true, message: 'Workout synced to Wahoo', external_id: externalId });
  } catch (error: any) {
    console.error('Error syncing workout to Wahoo:', error);
    res.status(500).json({ error: error.message || 'Failed to sync workout' });
  }
};

export const updateWahooSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
    const { auto_sync } = req.body;
    if (typeof auto_sync !== 'boolean') { res.status(400).json({ error: 'auto_sync must be a boolean' }); return; }
    const { error } = await supabaseAdmin
      .from('athletes')
      .update({ wahoo_auto_sync: auto_sync })
      .eq('id', req.user.id);
    if (error) throw new Error(`Failed to update settings: ${error.message}`);
    res.json({ success: true, auto_sync });
  } catch (error: any) {
    console.error('Error updating Wahoo settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
```

- [ ] **Step 2: Add Wahoo routes to `integrationsRoutes.ts`**

Add after the existing Intervals.icu routes:

```typescript
// Wahoo routes
router.get('/wahoo/auth-url', authenticateJWT, integrationsController.getWahooAuthUrl);
router.get('/wahoo/callback', integrationsController.handleWahooCallback);
router.get('/wahoo/status', authenticateJWT, integrationsController.getWahooStatus);
router.post('/wahoo/sync', authenticateJWT, integrationsController.syncWorkoutToWahoo);
router.post('/wahoo/settings', authenticateJWT, integrationsController.updateWahooSettings);
router.delete('/wahoo', authenticateJWT, integrationsController.disconnectWahoo);
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/integrationsController.ts backend/src/routes/integrationsRoutes.ts
git commit -m "feat: add Wahoo routes and controller methods"
```

---

### Task 5: Auto-sync Hook

**Files:**
- Modify: `backend/src/services/calendarService.ts`

- [ ] **Step 1: Add Wahoo import**

At the top of `calendarService.ts`, add:

```typescript
import { wahooService } from './wahooService';
```

- [ ] **Step 2: Expand the auto-sync block**

In `scheduleWorkout()` (around line 42), change the athlete select to also fetch Wahoo fields:

```typescript
const { data: athlete } = await supabaseAdmin
  .from('athletes')
  .select('intervals_icu_auto_sync, wahoo_auto_sync, wahoo_access_token')
  .eq('id', athleteId)
  .single();
```

Then **inside the same try block**, after the existing Intervals.icu `.catch()` (around line 55, before the outer `} catch (syncError) {`), add:

```typescript
if (athlete?.wahoo_auto_sync && athlete?.wahoo_access_token) {
  wahooService
    .uploadWorkout(athleteId, workoutId, scheduledDate, data.id)
    .then(() => {
      logger.debug(`Auto-synced workout ${workoutId} to Wahoo`);
    })
    .catch((err) => {
      logger.error(`Auto-sync to Wahoo failed:`, err.message);
    });
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/calendarService.ts
git commit -m "feat: add Wahoo auto-sync when scheduling workouts"
```

---

### Task 6: Frontend — Wahoo integration service + settings UI

**Files:**
- Create: `frontend/src/services/wahooService.ts`
- Modify: `frontend/src/components/settings/ProfileEditForm.tsx`

- [ ] **Step 1: Create frontend Wahoo service**

```typescript
import { api } from './api';

export const wahooService = {
  async getAuthUrl(): Promise<string> {
    const { data, error } = await api.get<{ authUrl: string }>('/api/integrations/wahoo/auth-url', true);
    if (error) throw new Error(error.error || 'Failed to get auth URL');
    return data!.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; user_id?: string; auto_sync: boolean }> {
    const { data, error } = await api.get<{ connected: boolean; user_id?: string; auto_sync: boolean }>(
      '/api/integrations/wahoo/status', true
    );
    if (error) throw new Error(error.error || 'Failed to get status');
    return data!;
  },

  async disconnect(): Promise<void> {
    const { error } = await api.delete('/api/integrations/wahoo', true);
    if (error) throw new Error(error.error || 'Failed to disconnect');
  },

  async updateSettings(autoSync: boolean): Promise<void> {
    const { error } = await api.post('/api/integrations/wahoo/settings', { auto_sync: autoSync }, true);
    if (error) throw new Error(error.error || 'Failed to update settings');
  },

  async syncWorkout(workoutId: string, scheduledDate: string, calendarEntryId?: string): Promise<void> {
    const { error } = await api.post('/api/integrations/wahoo/sync', {
      workout_id: workoutId,
      scheduled_date: scheduledDate,
      calendar_entry_id: calendarEntryId,
    }, true);
    if (error) throw new Error(error.error || 'Failed to sync workout');
  },
};
```

- [ ] **Step 2: Add Wahoo section to ProfileEditForm**

Find the Intervals.icu section in `ProfileEditForm.tsx` and add a similar "Wahoo" section after it. The pattern follows the existing integration UI — connect button when disconnected, status + auto-sync toggle + disconnect when connected. Check the URL params for `?wahoo=connected` on mount (same pattern as `?intervals_icu=connected`).

This step requires reading the current file to find the exact insertion point and match the existing JSX/styling patterns.

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/frontend && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/wahooService.ts frontend/src/components/settings/ProfileEditForm.tsx
git commit -m "feat: add Wahoo frontend service and settings UI"
```

---

### Task 7: Mobile — Wahoo settings section

**Files:**
- Create: `mobile/src/services/wahooService.ts`
- Modify: `mobile/src/screens/SettingsScreen.tsx`

- [ ] **Step 1: Create mobile Wahoo service**

```typescript
import apiClient from '../api/client';

export const wahooService = {
  async getAuthUrl(): Promise<string> {
    const { data } = await apiClient.get<{ authUrl: string }>('/api/integrations/wahoo/auth-url?mobile=true');
    return data.authUrl;
  },

  async getStatus(): Promise<{ connected: boolean; user_id?: string; auto_sync: boolean }> {
    const { data } = await apiClient.get('/api/integrations/wahoo/status');
    return data;
  },

  async disconnect(): Promise<void> {
    await apiClient.delete('/api/integrations/wahoo');
  },

  async updateSettings(autoSync: boolean): Promise<void> {
    await apiClient.post('/api/integrations/wahoo/settings', { auto_sync: autoSync });
  },

  async syncWorkout(workoutId: string, scheduledDate: string, calendarEntryId?: string): Promise<void> {
    await apiClient.post('/api/integrations/wahoo/sync', {
      workout_id: workoutId,
      scheduled_date: scheduledDate,
      calendar_entry_id: calendarEntryId,
    });
  },
};
```

- [ ] **Step 2: Add Wahoo section to SettingsScreen**

In `mobile/src/screens/SettingsScreen.tsx`, add a "Wahoo" section after the Strava section. Follow the Strava pattern:

- Add state: `wahooConnected`, `wahooLoading`, `wahooAutoSync`
- On mount: fetch `wahooService.getStatus()` to check connection
- Connect button: opens OAuth URL via `openAuthSessionAsync()` with redirect `cyclingcoach://wahoo/callback`
- Connected state: green dot + "Connected" text, auto-sync toggle (`Switch`), disconnect button
- Parse callback URL params after OAuth redirect to confirm connection

The exact JSX and styles should mirror the Strava section structure (the `stravaTitleRow`, `stravaConnected`, `statusDot`, `disconnectBtn` patterns).

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/mobile && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add mobile/src/services/wahooService.ts mobile/src/screens/SettingsScreen.tsx
git commit -m "feat: add Wahoo mobile service and settings UI"
```

---

### Task 8: Manual Smoke Test

- [ ] **Step 1: Run migration**

Run `024_wahoo_integration.sql` in the Supabase SQL editor.

- [ ] **Step 2: Set env vars**

Add to your Railway environment (or `.env` for local dev):
- `WAHOO_CLIENT_ID` — from developers.wahooligan.com
- `WAHOO_CLIENT_SECRET` — from developers.wahooligan.com
- `WAHOO_REDIRECT_URI` — your backend callback URL (e.g., `https://your-api.railway.app/api/integrations/wahoo/callback`)

- [ ] **Step 3: Test OAuth flow**

1. Start backend + frontend
2. Go to Settings → click "Connect Wahoo"
3. Authorize in Wahoo's OAuth page
4. Verify redirect back to settings with "Connected" status
5. Check `athletes` table — wahoo columns should be populated

- [ ] **Step 4: Test workout sync**

1. Create or schedule a workout
2. Verify it auto-syncs to Wahoo (check `workout_syncs` table)
3. On Wahoo ELEMNT companion app, verify the workout appears in planned workouts

- [ ] **Step 5: Test disconnect**

1. Click "Disconnect Wahoo"
2. Verify wahoo columns are nulled in `athletes` table
