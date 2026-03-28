# Wahoo Integration Design

**Date:** 2026-03-27
**Status:** Approved

## Problem

Users with Wahoo ELEMNT head units have no way to push structured workouts from the app to their device. When the AI coach creates a workout or the user schedules one to their calendar, it should optionally sync to Wahoo so it appears on their head unit for ride-along guidance.

## Solution

Add a Wahoo Cloud API integration following the same pattern as the existing Intervals.icu integration: OAuth 2.0 connection, auto-sync toggle, manual sync button, and workout sync tracking via the existing `workout_syncs` table.

## Wahoo API Details

- **Base URL:** `https://api.wahooligan.com/v1`
- **Auth:** OAuth 2.0 Authorization Code flow
- **Token endpoint:** `https://api.wahooligan.com/oauth/token`
- **Scopes:** `workouts_write plans_write user_read`
- **Developer portal:** `https://developers.wahooligan.com`

### Wahoo's two-step workout model

1. **Plan** = structured workout definition (intervals, power targets). Created via `POST /v1/plans` with a base64-encoded `.plan` file.
2. **Workout** = scheduled instance referencing a plan. Created via `POST /v1/workouts` with a date and plan reference.

Plans only sync to ELEMNT devices when the linked workout is scheduled within the current day + 6 days.

### Wahoo `.plan` file format

Text-based format with `=HEADER=` and `=STREAM=` sections:

```
=HEADER=
NAME=Threshold Intervals
DESCRIPTION=4x8min at FTP
DURATION=3600
FTP=250
PLAN_TYPE=0
WORKOUT_TYPE=0

=STREAM=
=INTERVAL=
INTERVAL_NAME=Warmup
PERCENT_FTP_LO=50
PERCENT_FTP_HI=65
MESG_DURATION_SEC>600

=INTERVAL=
INTERVAL_NAME=Work
PERCENT_FTP_LO=95
PERCENT_FTP_HI=105
MESG_DURATION_SEC>480
REPEAT=4
```

**Key fields per interval:**
- `PERCENT_FTP_LO` / `PERCENT_FTP_HI` — Power as % of FTP (maps directly to our `power` field)
- `MESG_DURATION_SEC` — Duration in seconds (maps to our `duration` field)
- `CAD_LO` / `CAD_HI` — Cadence targets (maps to our `cadence` field)
- `REPEAT` — Repeat count for interval blocks

**Limitations:**
- No ramp intervals — must convert ramps to stepped intervals
- Single target type per workout (power OR HR, not both)
- Only power-based targeting is relevant for our use case

## Design

### Database Migration

**File:** `backend/migrations/024_wahoo_integration.sql`

Add columns to `athletes` table:

```sql
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_user_id TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_access_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_refresh_token TEXT;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_token_expires_at TIMESTAMPTZ;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS wahoo_auto_sync BOOLEAN DEFAULT FALSE;
```

Update `workout_syncs.integration` check constraint to include `'wahoo'`:

```sql
ALTER TABLE workout_syncs DROP CONSTRAINT IF EXISTS workout_syncs_integration_check;
ALTER TABLE workout_syncs ADD CONSTRAINT workout_syncs_integration_check
  CHECK (integration IN ('intervals_icu', 'garmin', 'trainingpeaks', 'wahoo'));
```

### Backend Service — `wahooService.ts`

**File:** `backend/src/services/wahooService.ts`

Mirrors `intervalsIcuService.ts` structure:

- **`getAuthUrl(state: string)`** — Build OAuth authorization URL with scopes
- **`handleCallback(code: string, athleteId: string)`** — Exchange code for tokens, fetch user profile, store `wahoo_user_id` + tokens in athletes table
- **`getAccessToken(athleteId: string)`** — Return current token, auto-refresh if expiring within 5 minutes
- **`refreshToken(athleteId: string)`** — POST to `/oauth/token` with `grant_type=refresh_token`
- **`uploadWorkout(athleteId, workoutId, scheduledDate, calendarEntryId?)`**:
  1. Fetch workout + athlete FTP from DB
  2. Generate `.plan` file via `generateWahooPlan(workout, ftp)`
  3. Base64 encode, POST to `POST /v1/plans` with `plan[file]` and `plan[external_id]=workoutId`
  4. POST to `POST /v1/workouts` with `workout[starts]` (UTC) and plan reference
  5. Record in `workout_syncs` with `integration: 'wahoo'`, `external_id: planId`
- **`deleteWorkout(athleteId, workoutId)`** — DELETE the plan/workout from Wahoo, update `workout_syncs` status to `'deleted'`
- **`disconnect(athleteId: string)`** — Null all wahoo columns, set `wahoo_auto_sync: false`
- **`isConnected(athleteId: string)`** — Check if `wahoo_access_token` exists

Env vars read directly in the service (matching `intervalsIcuService.ts` pattern — no centralized config):
- `WAHOO_CLIENT_ID`, `WAHOO_CLIENT_SECRET`, `WAHOO_REDIRECT_URI`, `WAHOO_MOBILE_REDIRECT_URI`

### Plan File Generator — `wahooplanGenerator.ts`

**File:** `backend/src/services/wahooPlanGenerator.ts`

Function `generateWahooPlan(workout: Workout, athleteFtp: number): string`

Mapping from internal `WorkoutInterval[]` to Wahoo `.plan` format:

| Internal field | Wahoo field |
|---|---|
| `power` (% FTP) | `PERCENT_FTP_LO` and `PERCENT_FTP_HI` (±2% band) |
| `duration` (seconds) | `MESG_DURATION_SEC` |
| `cadence` (RPM) | `CAD_LO` / `CAD_HI` |
| `type` (warmup/work/rest/cooldown) | `INTERVAL_NAME` |
| `repeat` | `REPEAT` |
| `power_low`/`power_high` (ramp) | Convert to 3-5 stepped intervals spanning the range |

Header includes: `NAME`, `DESCRIPTION`, `DURATION` (total seconds), `FTP` (athlete's FTP), `PLAN_TYPE=0`, `WORKOUT_TYPE=0`.

### Routes & Controller

**File:** `backend/src/routes/integrationsRoutes.ts` (add to existing)
**File:** `backend/src/controllers/integrationsController.ts` (add methods)

New routes:

```
GET    /api/integrations/wahoo/auth-url    → getWahooAuthUrl
GET    /api/integrations/wahoo/callback    → handleWahooCallback
GET    /api/integrations/wahoo/status      → getWahooStatus
POST   /api/integrations/wahoo/sync        → syncWorkoutToWahoo
POST   /api/integrations/wahoo/settings    → updateWahooSettings
DELETE /api/integrations/wahoo             → disconnectWahoo
```

All routes except callback require `authenticateJWT` middleware. Controller methods are thin wrappers calling `wahooService`, identical pattern to Intervals.icu methods.

### Auto-sync Hook

**File:** `backend/src/services/calendarService.ts` — `scheduleWorkout()` method

The existing auto-sync block (around line 38-60) fetches `intervals_icu_auto_sync` and fires off `intervalsIcuService.uploadWorkout()`. Expand the SELECT to also fetch `wahoo_auto_sync` and `wahoo_access_token`, then add a parallel Wahoo sync check:

- If `wahoo_auto_sync: true` and `wahoo_access_token` is set, fire-and-forget call to `wahooService.uploadWorkout()`
- Runs alongside (not replacing) the existing Intervals.icu check

### Frontend Settings UI

**File:** `frontend/src/components/settings/ProfileEditForm.tsx`

The web frontend has an Intervals.icu section in this file. Add a "Wahoo" section following the same pattern:
- Disconnected: "Connect Wahoo" button → opens OAuth URL in new tab
- Connected: green indicator, auto-sync toggle, "Disconnect" button
- Callback handler on `/settings?wahoo=connected` (same as Intervals.icu pattern)

### Mobile Settings UI

**File:** `mobile/src/screens/SettingsScreen.tsx`

The mobile settings screen has a Strava section but no Intervals.icu section. Add a "Wahoo" section following the **Strava pattern** (not Intervals.icu):
- Uses `expo-web-browser.openAuthSessionAsync()` for OAuth
- Redirect URI: `cyclingcoach://wahoo/callback`
- Connected state: auto-sync toggle + disconnect button
- Same UI pattern as the existing Strava connection section

### Mobile Deep Link

**File:** `mobile/app.json` (or linking config)

Add `wahoo/callback` to the deep link configuration so the OAuth redirect returns to the app.

## Key Decisions

- **Follow Intervals.icu pattern exactly** — OAuth, service structure, controller, routes, sync tracking all mirror the existing integration
- **`.plan` text format** (not FIT files) — Wahoo requires `.plan` format for structured workouts pushed via API; FIT is only for completed activities
- **Include FTP in plan header** — Allows ELEMNT to display absolute watts; pass through power percentages directly since our intervals already store % of FTP
- **Ramps converted to steps** — Wahoo doesn't support ramps; split into 3-5 equal stepped intervals
- **`workout_syncs` table reused** — Just add `'wahoo'` to the check constraint; no new tables needed
- **Auto-sync + manual sync** — Same dual pattern as Intervals.icu; designed so Garmin integration can slot in identically later
- **7-day sync window** — Wahoo only shows workouts scheduled within current day + 6 days on the head unit; this is a Wahoo limitation, not something we need to enforce
