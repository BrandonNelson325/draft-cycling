# Clickable Suggested Workouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make suggested workouts on the dashboard clickable — view details and add to calendar — by having the AI pick from real workouts instead of inventing descriptions.

**Architecture:** Backend fetches user workouts + templates, passes them to the AI prompt so it returns a real `workoutId`. If the AI picks a template, it's cloned into the `workouts` table. Frontend/mobile make workout boxes clickable, opening the existing WorkoutDetail/WorkoutDetailSheet components.

**Tech Stack:** TypeScript, Express, Supabase, React, React Native (Expo), Claude AI API

**Spec:** `docs/superpowers/specs/2026-03-24-clickable-suggested-workouts-design.md`

---

### Task 1: Backend — Add template cloning helper

**Files:**
- Modify: `backend/src/services/dailyAnalysisService.ts`

This function clones a `workout_templates` row into the `workouts` table for a given athlete, so all existing workout endpoints work.

- [ ] **Step 1: Add the `cloneTemplateToWorkout` function**

Add this function near the top of the file, after the imports and before `suggestionCache`:

```typescript
/**
 * Clone a workout_template into the workouts table for a specific athlete.
 * Returns the new workout's ID.
 */
async function cloneTemplateToWorkout(templateId: string, athleteId: string): Promise<string> {
  // Fetch the template
  const { data: template, error: fetchErr } = await supabaseAdmin
    .from('workout_templates')
    .select('name, description, workout_type, duration_minutes, tss_estimate, intervals')
    .eq('id', templateId)
    .single();

  if (fetchErr || !template) {
    throw new Error(`Template ${templateId} not found`);
  }

  // Insert as a real workout for this athlete
  const { data: workout, error: insertErr } = await supabaseAdmin
    .from('workouts')
    .insert({
      athlete_id: athleteId,
      name: template.name,
      description: template.description,
      workout_type: template.workout_type,
      duration_minutes: template.duration_minutes,
      tss: template.tss_estimate,
      intervals: template.intervals,
      generated_by_ai: true,
      ai_prompt: 'Suggested by AI daily coach',
    })
    .select('id')
    .single();

  if (insertErr || !workout) {
    throw new Error(`Failed to clone template: ${insertErr?.message}`);
  }

  return workout.id;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dailyAnalysisService.ts
git commit -m "feat: add cloneTemplateToWorkout helper for daily suggestions"
```

---

### Task 2: Backend — Update TodaySuggestion interface and result assembly

**Files:**
- Modify: `backend/src/services/dailyAnalysisService.ts`

Add `workoutId` to the interface and include real IDs in the response for planned/tomorrow workouts.

- [ ] **Step 1: Update the `TodaySuggestion` interface**

Change the interface (around line 32-45) to add `workoutId?` to each workout sub-object:

```typescript
export interface TodaySuggestion {
  hasRiddenToday: boolean;
  suggestion: {
    summary: string;
    recommendation: string;
    suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more' | 'suggested-workout';
    todaysWorkout: { workoutId?: string; name: string; type: string; duration: number; tss: number } | null;
    suggestedWorkout: { workoutId?: string; name: string; type: string; duration: number; description: string } | null;
    status: 'well-recovered' | 'slightly-tired' | 'fatigued' | 'fresh';
    currentTSB: number;
    tomorrowsWorkout: { workoutId?: string; name: string; type: string; duration: number; tss: number } | null;
    todaysRides: { name: string; duration: number; tss: number }[];
  } | null;
}
```

- [ ] **Step 2: Update the result assembly in `getTodaySuggestion`**

In the result assembly block (around line 542-566), add `workoutId` to `todaysWorkout` and `tomorrowsWorkout`:

Change the `todaysWorkout` block from:
```typescript
todaysWorkout: hasPlannedWorkout
  ? {
      name: todayEntry.data.workouts.name,
      type: todayEntry.data.workouts.workout_type,
      duration: todayEntry.data.workouts.duration_minutes,
      tss: todayEntry.data.workouts.tss,
    }
  : null,
```
To:
```typescript
todaysWorkout: hasPlannedWorkout
  ? {
      workoutId: todayEntry.data.workouts.id,
      name: todayEntry.data.workouts.name,
      type: todayEntry.data.workouts.workout_type,
      duration: todayEntry.data.workouts.duration_minutes,
      tss: todayEntry.data.workouts.tss,
    }
  : null,
```

Change the `tomorrowsWorkout` block (around line 533-540) from:
```typescript
const tomorrowsWorkout = hasTomorrowWorkout
  ? {
      name: tomorrowEntry.data.workouts.name,
      type: tomorrowEntry.data.workouts.workout_type,
      duration: tomorrowEntry.data.workouts.duration_minutes,
      tss: tomorrowEntry.data.workouts.tss,
    }
  : null;
```
To:
```typescript
const tomorrowsWorkout = hasTomorrowWorkout
  ? {
      workoutId: tomorrowEntry.data.workouts.id,
      name: tomorrowEntry.data.workouts.name,
      type: tomorrowEntry.data.workouts.workout_type,
      duration: tomorrowEntry.data.workouts.duration_minutes,
      tss: tomorrowEntry.data.workouts.tss,
    }
  : null;
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/dailyAnalysisService.ts
git commit -m "feat: add workoutId to TodaySuggestion interface and result assembly"
```

---

### Task 3: Backend — Fetch workouts/templates and pass to AI prompt

**Files:**
- Modify: `backend/src/services/dailyAnalysisService.ts`

Fetch the athlete's workouts and all templates, build a normalized list, and pass it to the AI prompt functions.

- [ ] **Step 1: Add workout/template fetches to `getTodaySuggestion` Promise.all**

In the `Promise.all` block (around line 440-477), add two more queries:

```typescript
const [trainingStatus, yesterdayResult, todayEntry, tomorrowEntry, todayRidesResult, recentResult, fatigueProfile, athleteWorkoutsResult, templatesResult] = await Promise.all([
  // ... existing 7 queries ...
  supabaseAdmin
    .from('workouts')
    .select('id, name, workout_type, duration_minutes, tss')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(50),
  supabaseAdmin
    .from('workout_templates')
    .select('id, name, workout_type, duration_minutes, tss_estimate'),
]);
```

- [ ] **Step 2: Add `AvailableWorkout` interface and build normalized workout list**

First, add the interface near the top of the file (after imports, before `suggestionCache`):

```typescript
interface AvailableWorkout {
  id: string;
  name: string;
  type: string;
  duration: number;
  tss: number;
  source: 'athlete' | 'template';
}
```

Then after the Promise.all, add this normalization block:

```typescript
// Build normalized list of available workouts for AI to pick from
const athleteWorkouts: AvailableWorkout[] = (athleteWorkoutsResult.data || []).map((w: any) => ({
  id: w.id,
  name: w.name,
  type: w.workout_type,
  duration: w.duration_minutes,
  tss: w.tss || 0,
  source: 'athlete' as const,
}));

const templateWorkouts: AvailableWorkout[] = (templatesResult.data || []).map((t: any) => ({
  id: t.id,
  name: t.name,
  type: t.workout_type,
  duration: t.duration_minutes,
  tss: t.tss_estimate || 0,
  source: 'template' as const,
}));

// Deduplicate by name, prefer athlete workouts
const seenNames = new Set(athleteWorkouts.map(w => w.name));
const availableWorkouts: AvailableWorkout[] = [
  ...athleteWorkouts,
  ...templateWorkouts.filter(t => !seenNames.has(t.name)),
];
```

- [ ] **Step 3: Pass `availableWorkouts` to context builders**

Update the context-building calls (around line 496-504). Add `availableWorkouts` as the last parameter to both `buildSuggestionContext` and `buildPostRideContext`:

```typescript
if (riddenToday) {
  context = this.buildPostRideContext(
    todayActivities,
    trainingStatus,
    tomorrowEntry.data,
    recentActivities,
    fatigueProfile,
    availableWorkouts
  );
} else {
  context = this.buildSuggestionContext(
    yesterdayActivities,
    trainingStatus,
    todayEntry.data,
    recentActivities,
    hasPlannedWorkout,
    fatigueProfile,
    availableWorkouts
  );
}
```

- [ ] **Step 4: Update `buildSuggestionContext` to accept and use available workouts**

Add `availableWorkouts` parameter (after `fatigueProfile`):

```typescript
buildSuggestionContext(
  yesterdayActivities: any[],
  trainingStatus: any,
  todayEntry: any,
  recentActivities: any[],
  hasPlannedWorkout: boolean,
  fatigueProfile: FatigueProfile | null = null,
  availableWorkouts: AvailableWorkout[] = []
): string {
```

In the **no-planned-workout branch** (the `return` that starts around line 631), before the JSON format section, insert the available workouts list:

```typescript
const workoutListText = availableWorkouts.length > 0
  ? '\n\nAVAILABLE WORKOUTS (pick the best fit by ID):\n' +
    'id | name | type | duration_min | tss\n' +
    availableWorkouts.map(w => `${w.id} | ${w.name} | ${w.type} | ${w.duration} | ${w.tss}`).join('\n')
  : '';
```

Then in that branch's return string, insert `${workoutListText}` before `\n\nYOUR TASK:` and update the JSON format to include `workoutId`:

```
  "suggestedWorkout": {
    "workoutId": "<UUID from the AVAILABLE WORKOUTS list, or omit for rest days>",
    "name": "Workout Name (or 'Rest Day')",
    "type": "rest|recovery|endurance|tempo|threshold|vo2max",
    "duration": 0,
    "description": "1 sentence description (for rest: why rest is the right call)"
  }
```

The **has-planned-workout branch** needs no workout list (it already has a scheduled workout).

- [ ] **Step 5: Update `buildPostRideContext` the same way**

Add `availableWorkouts` parameter:

```typescript
buildPostRideContext(
  todayActivities: any[],
  trainingStatus: any,
  tomorrowEntry: any,
  recentActivities: any[],
  fatigueProfile: FatigueProfile | null = null,
  availableWorkouts: AvailableWorkout[] = []
): string {
```

In the **no-tomorrow-workout branch**, also fix the `suggestedAction` value: change `"proceed-as-planned"` to `"suggested-workout"` in the prompt template (currently hardcoded incorrectly at line 700). (`!hasTomorrow` section), add the same workout list text and `workoutId` field to the JSON format. The **has-tomorrow-workout branch** needs no changes.

- [ ] **Step 6: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/dailyAnalysisService.ts
git commit -m "feat: pass available workouts to AI prompt for real workout selection"
```

---

### Task 4: Backend — Handle AI response workoutId + template cloning

**Files:**
- Modify: `backend/src/services/dailyAnalysisService.ts`

After the AI returns a `workoutId`, check if it's a template and clone if needed.

- [ ] **Step 1: Update `getSuggestionAIAnalysis` return type**

Change the return type to include `workoutId`:

```typescript
async getSuggestionAIAnalysis(
  context: string,
  hasPlannedWorkout: boolean
): Promise<{
  summary: string;
  recommendation: string;
  suggestedAction: TodaySuggestion['suggestion'] extends null ? never : NonNullable<TodaySuggestion['suggestion']>['suggestedAction'];
  suggestedWorkout?: { workoutId?: string; name: string; type: string; duration: number; description: string };
}> {
```

- [ ] **Step 2: Add template-cloning logic in `getTodaySuggestion` after AI call**

After the `const aiResult = await this.getSuggestionAIAnalysis(...)` call (around line 507), add:

```typescript
// If AI picked a workout, resolve the ID (clone template if needed)
let resolvedWorkoutId: string | undefined;
if (aiResult.suggestedWorkout?.workoutId) {
  const pickedId = aiResult.suggestedWorkout.workoutId;
  // Validate the ID exists in our available workouts (guard against AI hallucination)
  const matchedWorkout = availableWorkouts.find(w => w.id === pickedId);
  if (!matchedWorkout) {
    logger.warn(`AI returned unknown workoutId ${pickedId}, ignoring`);
  } else if (matchedWorkout.source === 'athlete') {
    resolvedWorkoutId = pickedId;
  } else {
    // It's a template — clone it into the athlete's workouts
    try {
      resolvedWorkoutId = await cloneTemplateToWorkout(pickedId, athleteId);
    } catch (err) {
      logger.warn('Failed to clone template, suggestion will lack workoutId:', err);
    }
  }
}
```

- [ ] **Step 3: Use `resolvedWorkoutId` in the result assembly**

Update the `suggestedWorkout` in the result (around line 556):

```typescript
suggestedWorkout: aiResult.suggestedWorkout
  ? {
      workoutId: resolvedWorkoutId,
      name: aiResult.suggestedWorkout.name,
      type: aiResult.suggestedWorkout.type,
      duration: aiResult.suggestedWorkout.duration,
      description: aiResult.suggestedWorkout.description,
    }
  : null,
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/dailyAnalysisService.ts
git commit -m "feat: resolve AI-picked workoutId with template cloning"
```

---

### Task 5: Backend — Cache invalidation on workout schedule

**Files:**
- Modify: `backend/src/controllers/calendarController.ts`

When a workout is scheduled via the calendar endpoint, clear the daily suggestion cache so the dashboard reflects the change.

- [ ] **Step 1: Import `clearSuggestionCache` and add call after successful schedule**

At the top of `calendarController.ts`, add:

```typescript
import { clearSuggestionCache } from '../services/dailyAnalysisService';
```

**Note:** `clearSuggestionCache` is already exported from `dailyAnalysisService.ts` (line 113).

In the `scheduleWorkout` function, after the successful insert/response, add:

```typescript
clearSuggestionCache(req.user.id);
```

This ensures that when the frontend re-fetches the suggestion after scheduling, it gets fresh data instead of the cached version that still shows "suggested."

- [ ] **Step 2: Verify compilation and commit**

```bash
cd /Users/bnelson/PersonalDev/cycling-coach/backend && npx tsc --noEmit
git add backend/src/controllers/calendarController.ts
git commit -m "feat: clear suggestion cache when workout is scheduled"
```

---

### Task 6: Frontend — Update TodaySuggestion type

**Files:**
- Modify: `frontend/src/services/dailyAnalysisService.ts`

- [ ] **Step 1: Add `workoutId` to the frontend `TodaySuggestion` interface**

Update the interface (around line 27-40):

```typescript
export interface TodaySuggestion {
  hasRiddenToday: boolean;
  suggestion: {
    summary: string;
    recommendation: string;
    suggestedAction: 'proceed-as-planned' | 'make-easier' | 'add-rest' | 'can-do-more' | 'suggested-workout';
    todaysWorkout: { workoutId?: string; name: string; type: string; duration: number; tss: number } | null;
    suggestedWorkout: { workoutId?: string; name: string; type: string; duration: number; description: string } | null;
    status: 'well-recovered' | 'slightly-tired' | 'fatigued' | 'fresh';
    currentTSB: number;
    tomorrowsWorkout: { workoutId?: string; name: string; type: string; duration: number; tss: number } | null;
    todaysRides: { name: string; duration: number; tss: number }[];
  } | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/dailyAnalysisService.ts
git commit -m "feat: add workoutId to frontend TodaySuggestion type"
```

---

### Task 7: Frontend — Make CoachCard workout boxes clickable

**Files:**
- Modify: `frontend/src/components/dashboard/CoachCard.tsx`

- [ ] **Step 1: Add imports and state**

Add these imports at the top:

```typescript
import { WorkoutDetail } from '../workout/WorkoutDetail';
import { workoutService } from '../../services/workoutService';
import { calendarService } from '../../services/calendarService';
import type { Workout } from '../../services/workoutService';
```

Inside the `CoachCard` component, add state after existing state declarations:

```typescript
const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
const [loadingWorkoutId, setLoadingWorkoutId] = useState<string | null>(null);
```

- [ ] **Step 2: Add click handler function**

Add this handler inside the component:

```typescript
const handleWorkoutClick = async (workoutId: string | undefined) => {
  if (!workoutId || loadingWorkoutId) return;
  setLoadingWorkoutId(workoutId);
  try {
    const workout = await workoutService.getWorkout(workoutId);
    setSelectedWorkout(workout);
  } catch (err) {
    console.error('Failed to load workout:', err);
  } finally {
    setLoadingWorkoutId(null);
  }
};

const handleSchedule = async (workout: Workout) => {
  try {
    const targetDate = hasRidden ? new Date(new Date().setDate(new Date().getDate() + 1)) : new Date();
    await calendarService.scheduleWorkout(workout.id, targetDate);
    setSelectedWorkout(null);
    // Refresh suggestion data
    const fresh = await dailyAnalysisService.getTodaySuggestion();
    setSuggestion(fresh);
  } catch (err) {
    console.error('Failed to schedule workout:', err);
  }
};
```

- [ ] **Step 3: Make the planned workout box (blue, line 87-95) clickable**

Replace the static `<div>` with a clickable one:

```tsx
{!hasRidden && s.todaysWorkout && (
  <div
    className={`rounded-lg border border-blue-200 bg-blue-50 p-3 ${s.todaysWorkout.workoutId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    onClick={() => handleWorkoutClick(s.todaysWorkout?.workoutId)}
  >
    <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700 mb-1">Planned</p>
    <p className="text-sm font-medium text-gray-800">{s.todaysWorkout.name}</p>
    <p className="text-xs text-gray-500">
      {s.todaysWorkout.duration}min · {s.todaysWorkout.type} · {s.todaysWorkout.tss} TSS
    </p>
  </div>
)}
```

- [ ] **Step 4: Make the suggested workout box (purple, line 98-111) clickable**

Replace with:

```tsx
{!hasRidden && s.suggestedWorkout && !s.todaysWorkout && (
  <div
    className={`rounded-lg border p-3 ${s.suggestedWorkout.type === 'rest' ? 'border-green-200 bg-green-50' : 'border-purple-200 bg-purple-50'} ${s.suggestedWorkout.workoutId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    onClick={() => handleWorkoutClick(s.suggestedWorkout?.workoutId)}
  >
    <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${s.suggestedWorkout.type === 'rest' ? 'text-green-700' : 'text-purple-700'}`}>
      {s.suggestedWorkout.type === 'rest' ? 'Rest Day' : 'Suggested'}
    </p>
    <p className="text-sm font-medium text-gray-800">{s.suggestedWorkout.name}</p>
    {s.suggestedWorkout.type !== 'rest' && (
      <p className="text-xs text-gray-500">
        {s.suggestedWorkout.duration}min · {s.suggestedWorkout.type}
      </p>
    )}
    <p className="text-xs text-gray-500 mt-1">{s.suggestedWorkout.description}</p>
  </div>
)}
```

- [ ] **Step 5: Make the tomorrow workout box (line 114-122) and suggested-for-tomorrow box (line 124-138) clickable**

Apply the same pattern: add `cursor-pointer hover:shadow-md transition-shadow` conditionally on `workoutId`, add `onClick={() => handleWorkoutClick(...)}`.

- [ ] **Step 6: Render WorkoutDetail modal at the bottom of the component**

Just before the closing `</Card>` tag, add:

```tsx
{selectedWorkout && (
  <WorkoutDetail
    workout={selectedWorkout}
    onClose={() => setSelectedWorkout(null)}
    onSchedule={
      // Only show schedule for suggested workouts (not already on calendar)
      !s?.todaysWorkout?.workoutId || selectedWorkout.id !== s.todaysWorkout.workoutId
        ? handleSchedule
        : undefined
    }
  />
)}
```

- [ ] **Step 7: Verify it compiles**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/frontend && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/dashboard/CoachCard.tsx
git commit -m "feat: make CoachCard workout boxes clickable with WorkoutDetail modal"
```

---

### Task 8: Frontend — Make TodaySuggestionCard workout boxes clickable

**Files:**
- Modify: `frontend/src/components/dashboard/TodaySuggestionCard.tsx`

Apply the same pattern as Task 6 to `TodaySuggestionCard`.

- [ ] **Step 1: Add imports and state**

Same imports as Task 7 Step 1. Add `selectedWorkout`, `loadingWorkoutId` state.

- [ ] **Step 2: Add `handleWorkoutClick` and `handleSchedule` handlers**

Same as Task 7 Step 2, using `setData` instead of `setSuggestion` to refresh:

```typescript
const handleSchedule = async (workout: Workout) => {
  try {
    const targetDate = hasRiddenToday ? new Date(new Date().setDate(new Date().getDate() + 1)) : new Date();
    await calendarService.scheduleWorkout(workout.id, targetDate);
    setSelectedWorkout(null);
    const fresh = await dailyAnalysisService.getTodaySuggestion();
    setData(fresh);
  } catch (err) {
    console.error('Failed to schedule workout:', err);
  }
};
```

- [ ] **Step 3: Make all workout boxes clickable**

Apply `cursor-pointer hover:shadow-md transition-shadow` + `onClick` to:
- Planned workout box (line 93-103)
- Suggested workout box (line 106-117)
- Tomorrow workout box (line 120-130)

Same pattern as Task 7.

- [ ] **Step 4: Render WorkoutDetail modal**

Before closing `</Card>`, same as Task 7 Step 6.

- [ ] **Step 5: Verify compilation and commit**

```bash
cd /Users/bnelson/PersonalDev/cycling-coach/frontend && npx tsc --noEmit
git add frontend/src/components/dashboard/TodaySuggestionCard.tsx
git commit -m "feat: make TodaySuggestionCard workout boxes clickable"
```

---

### Task 9: Mobile — Update types and make CoachCard interactive

**Files:**
- Modify: `mobile/src/services/dailyAnalysisService.ts`
- Modify: `mobile/src/components/dashboard/CoachCard.tsx`

- [ ] **Step 1: Update mobile `TodaySuggestion` type**

Same changes as Task 5 — add `workoutId?: string` to `todaysWorkout`, `suggestedWorkout`, and `tomorrowsWorkout`.

- [ ] **Step 2: Add `onWorkoutPress` prop to mobile CoachCard**

Update the component to accept an `onWorkoutPress` callback:

```typescript
interface CoachCardProps {
  refreshKey?: number;
  onWorkoutPress?: (workoutId: string) => void;
}

export function CoachCard({ refreshKey, onWorkoutPress }: CoachCardProps) {
```

- [ ] **Step 3: Wrap workout boxes with TouchableOpacity**

Import `TouchableOpacity` from `react-native`. For each workout box that has a `workoutId`, wrap with:

```tsx
<TouchableOpacity
  activeOpacity={0.7}
  onPress={() => workoutId && onWorkoutPress?.(workoutId)}
  disabled={!workoutId}
>
  {/* existing box content */}
</TouchableOpacity>
```

Apply to: planned workout, suggested workout, tomorrow workout, and suggested-for-tomorrow boxes.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/services/dailyAnalysisService.ts mobile/src/components/dashboard/CoachCard.tsx
git commit -m "feat: add workoutId to mobile types and make CoachCard interactive"
```

---

### Task 10: Mobile — Make TodaySuggestionCard interactive

**Files:**
- Modify: `mobile/src/components/dashboard/TodaySuggestionCard.tsx`

- [ ] **Step 1: Add `onWorkoutPress` prop and wrap workout boxes**

Same pattern as Task 9 Steps 2-3. Add `onWorkoutPress?: (workoutId: string) => void` to props, wrap workout boxes with `TouchableOpacity`.

- [ ] **Step 2: Commit**

```bash
git add mobile/src/components/dashboard/TodaySuggestionCard.tsx
git commit -m "feat: make mobile TodaySuggestionCard interactive"
```

---

### Task 11: Mobile — Wire up DashboardScreen with WorkoutDetailSheet

**Files:**
- Modify: `mobile/src/screens/DashboardScreen.tsx`

- [ ] **Step 1: Add workout detail bottom sheet state and ref**

Add imports:

```typescript
import { workoutService } from '../services/workoutService';
import type { Workout } from '../services/workoutService';
import WorkoutDetailSheet from '../components/workout/WorkoutDetailSheet';
```

**Note:** `WorkoutDetailSheet` uses a default export, not named. `Workout` type should come from `workoutService` for consistency.

Add state and ref:

```typescript
const workoutSheetRef = useRef<BottomSheetModal>(null);
const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
```

- [ ] **Step 2: Add handler**

```typescript
const handleWorkoutPress = async (workoutId: string) => {
  try {
    const workout = await workoutService.getWorkout(workoutId);
    setSelectedWorkout(workout);
    workoutSheetRef.current?.present();
  } catch (err) {
    console.error('Failed to load workout:', err);
  }
};
```

- [ ] **Step 3: Pass `onWorkoutPress` to CoachCard and TodaySuggestionCard**

```tsx
<CoachCard refreshKey={refreshKey} onWorkoutPress={handleWorkoutPress} />
```

**Note:** `DashboardScreen` only renders `CoachCard`, not `TodaySuggestionCard`. No changes needed for `TodaySuggestionCard` here.

- [ ] **Step 4: Add WorkoutDetailSheet bottom sheet**

After the existing ActivityDetailSheet bottom sheet modal:

```tsx
<BottomSheetModal
  ref={workoutSheetRef}
  snapPoints={['85%']}
  enableDynamicSizing={false}
  backgroundStyle={{ backgroundColor: colors.card }}
>
  <WorkoutDetailSheet
    workout={selectedWorkout}
    onClose={() => workoutSheetRef.current?.dismiss()}
    onScheduled={() => {
      workoutSheetRef.current?.dismiss();
      setRefreshKey(k => k + 1);
    }}
    showSchedule={true}
  />
</BottomSheetModal>
```

- [ ] **Step 5: Verify mobile compiles**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/mobile && npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 6: Commit**

```bash
git add mobile/src/screens/DashboardScreen.tsx
git commit -m "feat: wire DashboardScreen with WorkoutDetailSheet for suggestions"
```

---

### Task 12: Manual smoke test

- [ ] **Step 1: Start backend**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/backend && npm run dev`

- [ ] **Step 2: Start frontend**

Run: `cd /Users/bnelson/PersonalDev/cycling-coach/frontend && npm run dev`

- [ ] **Step 3: Test the flow**

1. Open dashboard — verify the suggested workout box shows up
2. Click the suggested workout — verify WorkoutDetail modal opens with full workout data
3. Click "Schedule Workout" in the modal — verify it schedules to calendar
4. Refresh dashboard — verify the suggestion updates (now shows as planned)
5. Check calendar page — verify the workout appears on the correct date

- [ ] **Step 4: Test edge cases**

1. Rest day suggestion — verify it's not clickable
2. Planned workout (already scheduled) — verify it opens WorkoutDetail but without schedule button
3. Tomorrow's workout — verify it opens WorkoutDetail
