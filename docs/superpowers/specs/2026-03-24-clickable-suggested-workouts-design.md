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
   - Fetch workout templates: `supabaseAdmin.from('workout_templates').select('id, name, workout_type, duration_minutes, tss')`

2. In `buildSuggestionContext()` and `buildPostRideContext()` (the no-planned-workout branches):
   - Append a compact workout list to the prompt: `AVAILABLE WORKOUTS:\nid | name | type | duration | tss`
   - Combine user workouts + templates, deduplicate by name
   - Update the JSON format instruction: replace free-text `suggestedWorkout` with `"workoutId": "<id>"` and keep `"suggestedWorkout"` for rest days only

3. Update `TodaySuggestion` interface:
   - `suggestedWorkout`: add `workoutId?: string`
   - `todaysWorkout`: add `workoutId?: string`
   - `tomorrowsWorkout`: add `workoutId?: string`

4. In the result assembly, include workout IDs:
   - `todaysWorkout.workoutId` from `todayEntry.data.workouts.id`
   - `tomorrowsWorkout.workoutId` from `tomorrowEntry.data.workouts.id`
   - `suggestedWorkout.workoutId` from AI response

5. In `getSuggestionAIAnalysis()`, update the return type to include `workoutId?: string` in `suggestedWorkout`.

### Frontend Changes

**File:** `frontend/src/services/dailyAnalysisService.ts`
- Add `workoutId?: string` to `suggestedWorkout`, `todaysWorkout`, and `tomorrowsWorkout` in the `TodaySuggestion` interface

**Files:** `frontend/src/components/dashboard/CoachCard.tsx` and `TodaySuggestionCard.tsx`

1. Import `WorkoutDetail` from `../workout/WorkoutDetail`, `workoutService`, and `calendarService`
2. Add state: `selectedWorkout` (full Workout object or null), `schedulingWorkoutId` (loading state)
3. Make workout boxes clickable:
   - Add `cursor-pointer hover:shadow-md transition-shadow` + `onClick` handler
   - On click: call `workoutService.getWorkout(workoutId)`, set `selectedWorkout`
   - Render `WorkoutDetail` modal when `selectedWorkout` is set
4. Add "Add to Calendar" button on suggested workout boxes (purple):
   - Pre-ride: schedules for today's date
   - Post-ride "Suggested for Tomorrow": schedules for tomorrow's date
   - Calls `calendarService.scheduleWorkout(workoutId, date)`
   - Show success feedback (brief inline text or the box changes to "Scheduled" style)
5. Rest day suggestions: remain non-clickable (no `workoutId`)
6. Planned workout boxes (blue): clickable to view `WorkoutDetail`, no schedule button needed (already on calendar)

### Mobile Changes

**File:** `mobile/src/services/dailyAnalysisService.ts` (or equivalent types)
- Same `workoutId` additions to the `TodaySuggestion` type

**File:** `mobile/src/components/dashboard/TodaySuggestionCard.tsx`
- Make suggestion boxes pressable (`TouchableOpacity`)
- On press: fetch workout via `workoutService.getWorkout(workoutId)`
- Open `WorkoutDetailSheet` with `showSchedule={true}`
- The existing date picker + schedule flow in `WorkoutDetailSheet` handles the rest

**File:** `mobile/src/screens/DashboardScreen.tsx`
- If the `TodaySuggestionCard` needs to open a bottom sheet that lives in the parent, pass an `onWorkoutPress(workoutId)` callback

## Key Decisions

- **AI picks from real workouts** rather than fuzzy-matching after the fact — more reliable
- **Workout templates included** alongside user's library so new users with few custom workouts still get good suggestions
- **Rest days remain non-clickable** — no workout to view or schedule
- **Existing `WorkoutDetail` and `WorkoutDetailSheet` reused** — no new components needed
- **Planned workout IDs included too** — makes all workout boxes on the dashboard interactive, not just suggestions
