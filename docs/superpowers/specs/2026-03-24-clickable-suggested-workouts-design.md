# Clickable Suggested Workouts on Dashboard

**Date:** 2026-03-24
**Status:** Approved

## Problem

Suggested workouts on the main dashboard (in `CoachCard` and `TodaySuggestionCard`) are display-only. The AI generates a free-text name/type/duration/description with no link to a real workout record. Users cannot click to view details or add the suggestion to their calendar.

Planned workouts (`todaysWorkout`, `tomorrowsWorkout`) come from real `calendar_entries` + `workouts` joins but their IDs are also not sent to the frontend, so those boxes are not clickable either.

## Solution

Have the AI pick from real workouts (user's library + workout templates) instead of inventing descriptions. Return the `workoutId` with the suggestion so the frontend can open `WorkoutDetail` and schedule it.

## Design

### Backend Changes

**File:** `backend/src/services/dailyAnalysisService.ts`

1. In `getTodaySuggestion()`, add queries to the existing `Promise.all`:
   - Fetch athlete's workouts: `supabaseAdmin.from('workouts').select('id, name, workout_type, duration_minutes, tss').eq('athlete_id', athleteId)`
   - Fetch workout templates: `supabaseAdmin.from('workout_templates').select('id, name, workout_type, duration_minutes, tss_estimate')` (note: templates use `tss_estimate`, not `tss`)

2. In `buildSuggestionContext()` and `buildPostRideContext()` (the no-planned-workout branches):
   - Accept a new `availableWorkouts` parameter: a normalized list of `{ id, name, type, duration, tss }` combining user workouts + templates (map `tss_estimate` → `tss` for templates)
   - Append a compact workout list to the prompt: `AVAILABLE WORKOUTS:\nid | name | type | duration | tss`
   - Deduplicate by name (prefer user workout over template if same name)
   - Update the JSON format instruction: AI returns `"workoutId": "<id>"` for non-rest suggestions. Keep free-text `suggestedWorkout` fields (name, type, duration, description) alongside the ID for display fallback.
   - For rest day suggestions: no `workoutId`, just the rest day description as before.

3. **Template-to-workout cloning:** When the AI picks a template ID (from `workout_templates` table), clone it into the `workouts` table for the athlete before returning. This ensures `getWorkout(id)` works via the existing `/api/workouts/:id` endpoint which filters by `athlete_id`. The clone step:
   - Check if the returned ID belongs to `workout_templates` (not `workouts`)
   - If so, insert a new row in `workouts` with the template data + `athlete_id`
   - Return the new workout's ID as `workoutId`

4. Update `TodaySuggestion` interface:
   - `suggestedWorkout`: add `workoutId?: string`
   - `todaysWorkout`: add `workoutId?: string`
   - `tomorrowsWorkout`: add `workoutId?: string`

5. In the result assembly, include workout IDs:
   - `todaysWorkout.workoutId` from `todayEntry.data.workouts.id`
   - `tomorrowsWorkout.workoutId` from `tomorrowEntry.data.workouts.id`
   - `suggestedWorkout.workoutId` from AI response (after template clone if needed)

6. In `getSuggestionAIAnalysis()`, update the return type to include `workoutId?: string`.

### Frontend Changes

**File:** `frontend/src/services/dailyAnalysisService.ts`
- Add `workoutId?: string` to `suggestedWorkout`, `todaysWorkout`, and `tomorrowsWorkout` in the `TodaySuggestion` interface

**Files:** `frontend/src/components/dashboard/CoachCard.tsx` and `TodaySuggestionCard.tsx`

1. Import `WorkoutDetail` from `../workout/WorkoutDetail`, `workoutService`, and `calendarService`
2. Add state: `selectedWorkout` (full Workout object or null)
3. Make workout boxes clickable (when `workoutId` is present):
   - Add `cursor-pointer hover:shadow-md transition-shadow` + `onClick` handler
   - On click: call `workoutService.getWorkout(workoutId)`, set `selectedWorkout`
   - Render `WorkoutDetail` modal when `selectedWorkout` is set
   - Use the existing `onSchedule` prop on `WorkoutDetail` to handle scheduling
4. `onSchedule` handler for suggested workouts:
   - Determine target date from context: if `hasRiddenToday` is true, schedule for tomorrow; otherwise schedule for today
   - Call `calendarService.scheduleWorkout(workoutId, targetDate)`
   - On success: clear `selectedWorkout`, refresh suggestion data, invalidate backend cache
5. Rest day suggestions: remain non-clickable (no `workoutId`)
6. Planned workout boxes (blue): clickable to view `WorkoutDetail`, no schedule button needed (already on calendar) — pass `onSchedule` as undefined or omit it

**Note:** `WorkoutDetail` renders as a full-screen modal overlay (fixed inset-0 with backdrop). Just conditionally render it — no wrapper needed.

### Mobile Changes

**File:** `mobile/src/services/dailyAnalysisService.ts` (or equivalent types)
- Same `workoutId` additions to the `TodaySuggestion` type

**Files:** `mobile/src/components/dashboard/CoachCard.tsx` and `TodaySuggestionCard.tsx`
- Make suggestion/planned/tomorrow workout boxes pressable (`TouchableOpacity`) when `workoutId` is present
- On press: call `onWorkoutPress(workoutId)` callback (passed from parent)
- Rest day suggestions: remain non-pressable

**File:** `mobile/src/screens/DashboardScreen.tsx`
- Add state for selected workout + bottom sheet ref
- Pass `onWorkoutPress(workoutId)` to `CoachCard` and `TodaySuggestionCard`
- On callback: fetch workout via `workoutService.getWorkout(workoutId)`, open `WorkoutDetailSheet` with `showSchedule={true}`
- The existing date picker + schedule flow in `WorkoutDetailSheet` handles the rest

### Cache Invalidation

After a user schedules a suggested workout from the dashboard:
- Frontend: re-fetch suggestion data so the UI updates (suggested → planned)
- Backend: call `clearSuggestionCache(athleteId)` after the calendar entry is created (this function already exists in `dailyAnalysisService.ts`)

## Key Decisions

- **AI picks from real workouts** rather than fuzzy-matching after the fact — more reliable
- **Workout templates cloned to workouts table** when selected — ensures all existing workout endpoints work without modification
- **`tss_estimate` normalized to `tss`** when combining templates with user workouts for the AI prompt
- **Workout templates included** alongside user's library so new users with few custom workouts still get good suggestions
- **Rest days remain non-clickable** — no workout to view or schedule
- **Existing `WorkoutDetail` and `WorkoutDetailSheet` reused** — no new components needed; `onSchedule` prop leveraged
- **Planned workout IDs included too** — makes all workout boxes on the dashboard interactive, not just suggestions
- **Target date inferred from `hasRiddenToday`** — today if pre-ride, tomorrow if post-ride
