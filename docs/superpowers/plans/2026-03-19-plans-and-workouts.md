# Plans & Workouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Workouts page with a combined Plans & Workouts tabbed page, add a backend endpoint for plan templates, and integrate plan browsing into chat.

**Architecture:** New `GET /api/training-plans/templates` endpoint exposes the existing `training_plan_templates` table. Frontend and mobile get a tabbed page: Tab 1 shows plan template cards (tapping hands off to chat), Tab 2 preserves existing workout browsing. Chat gets a "Browse Plans" quick-action and a suggested prompt chip.

**Tech Stack:** Express/TypeScript (backend), React/Vite (frontend), Expo/React Native (mobile), Supabase (DB)

**Spec:** `docs/superpowers/specs/2026-03-19-plans-and-workouts-design.md`

**Hard constraint:** No regressions. All existing functionality must be preserved exactly. This is purely additive.

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `backend/migrations/023_ftp_builder_template.sql` | FTP Builder plan template seed |
| `frontend/src/components/plans/PlanTemplateCard.tsx` | Single plan template card (web) |
| `frontend/src/components/plans/PlanTemplateList.tsx` | Filtered grid of plan template cards (web) |
| `mobile/src/components/plans/PlanTemplateCard.tsx` | Single plan template card (mobile) |
| `mobile/src/components/plans/PlanTemplateList.tsx` | Filtered list of plan template cards (mobile) |

### Modified Files
| File | Change |
|------|--------|
| `backend/src/types/trainingPlan.ts` | Add `TrainingPlanTemplate` interface |
| `backend/src/controllers/trainingPlanController.ts` | Add `getTemplates` handler |
| `backend/src/routes/trainingPlanRoutes.ts` | Add `GET /templates` route (BEFORE `/:planId` to avoid param conflict) |
| `frontend/src/types/shared.ts` | Add `TrainingPlanTemplate` interface |
| `frontend/src/services/trainingPlanService.ts` | Add `getTemplates()` method |
| `frontend/src/pages/WorkoutsPage.tsx` | Refactor to `PlansAndWorkoutsPage` with tab structure wrapping existing WorkoutLibrary |
| `frontend/src/App.tsx` | Route `/plans`, redirect `/workouts` → `/plans`, update import |
| `frontend/src/components/navigation/DesktopNav.tsx` | Change Workouts item to Plans at `/plans` |
| `frontend/src/components/navigation/MobileNav.tsx` | Change Plan item from `/training-plan` to `/plans` |
| `frontend/src/pages/TrainingPlanPage.tsx` | Update "Browse Plans" to navigate to `/plans` |
| `frontend/src/pages/ChatPage.tsx` | Add "Browse Plans" quick-action button |
| `mobile/src/types/shared.ts` | Add `TrainingPlanTemplate` interface |
| `mobile/src/services/trainingPlanService.ts` | Add `getTemplates()` method |
| `mobile/src/navigation/types.ts` | Rename `Workouts` → `Plans` in `MainTabParamList` |
| `mobile/src/navigation/MainTabNavigator.tsx` | Rename tab, update icon, import new screen |
| `mobile/src/screens/WorkoutsScreen.tsx` | Refactor to tabbed screen with Plans + Workouts tabs |
| `mobile/src/screens/TrainingPlanScreen.tsx` | Update "Browse Plans" to navigate to Plans tab |
| `mobile/src/screens/ChatScreen.tsx` | Add "Browse Plans" quick-action button |

---

## Task 1: Backend — TrainingPlanTemplate type + endpoint

**Files:**
- Modify: `backend/src/types/trainingPlan.ts`
- Modify: `backend/src/controllers/trainingPlanController.ts`
- Modify: `backend/src/routes/trainingPlanRoutes.ts`

- [ ] **Step 1: Add TrainingPlanTemplate interface**

In `backend/src/types/trainingPlan.ts`, add after the existing exports:

```typescript
export interface TrainingPlanTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  target_event: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  duration_weeks: number;
  days_per_week: number;
  hours_per_week_min: number;
  hours_per_week_max: number;
  tags: string[];
  sort_order: number;
}
```

- [ ] **Step 2: Add getTemplates controller**

In `backend/src/controllers/trainingPlanController.ts`, add the import for `supabaseAdmin` and the handler:

```typescript
import { supabaseAdmin } from '../utils/supabase';

export const getTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { difficulty, search } = req.query;

    let query = supabaseAdmin
      .from('training_plan_templates')
      .select('id, name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, tags, sort_order')
      .order('sort_order', { ascending: true });

    if (difficulty && typeof difficulty === 'string') {
      query = query.eq('difficulty_level', difficulty);
    }

    if (search && typeof search === 'string') {
      // Sanitize search input: escape PostgREST special characters
      const sanitized = search.replace(/[%_.,()]/g, '');
      if (sanitized.length > 0) {
        query = query.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Get templates error:', error);
      res.status(500).json({ error: 'Failed to get training plan templates' });
      return;
    }

    res.json({ templates: data || [] });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to get training plan templates' });
  }
};
```

- [ ] **Step 3: Add route**

In `backend/src/routes/trainingPlanRoutes.ts`, add the templates route **BEFORE** the `/:planId` route (otherwise Express matches "templates" as a planId param):

```typescript
// Must be before /:planId to avoid param conflict
router.get('/templates', authenticateJWT, checkSubscription, trainingPlanController.getTemplates);
```

- [ ] **Step 4: Verify backend compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/trainingPlan.ts backend/src/controllers/trainingPlanController.ts backend/src/routes/trainingPlanRoutes.ts
git commit -m "feat: add GET /api/training-plans/templates endpoint"
```

---

## Task 2: Database — FTP Builder template migration

**Files:**
- Create: `backend/migrations/023_ftp_builder_template.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Add FTP Builder training plan template
INSERT INTO training_plan_templates (name, slug, description, target_event, difficulty_level, duration_weeks, days_per_week, hours_per_week_min, hours_per_week_max, phases, tags, sort_order) VALUES
('FTP Builder', 'ftp-builder',
 'Progressive plan focused on raising your functional threshold power through sweet spot and threshold work. Builds aerobic base first, then layers in progressively harder FTP-specific intervals.',
 'General Fitness',
 'intermediate',
 8, 4, 6.0, 9.0,
 '[
   {
     "phase": "base",
     "weeks": [1, 2],
     "description": "Aerobic foundation with sweet spot introduction",
     "weekly_structure": [
       {"day": "tuesday", "type": "sweet_spot", "duration_minutes": 60, "difficulty": "moderate", "description": "Sweet Spot 2x15"},
       {"day": "thursday", "type": "endurance", "duration_minutes": 60, "difficulty": "easy", "description": "Endurance ride with cadence drills"},
       {"day": "saturday", "type": "endurance", "duration_minutes": 90, "difficulty": "moderate", "description": "Long Z2 endurance ride"},
       {"day": "sunday", "type": "recovery", "duration_minutes": 45, "difficulty": "easy", "description": "Easy recovery spin"}
     ]
   },
   {
     "phase": "build",
     "weeks": [3, 4, 5, 6],
     "description": "Progressive threshold and sweet spot intervals",
     "weekly_structure": [
       {"day": "tuesday", "type": "threshold", "duration_minutes": 60, "difficulty": "hard", "description": "Threshold intervals 3x10 progressing to 3x15"},
       {"day": "thursday", "type": "sweet_spot", "duration_minutes": 60, "difficulty": "moderate", "description": "Sweet spot 2x20 progressing to 1x40"},
       {"day": "saturday", "type": "endurance", "duration_minutes": 105, "difficulty": "moderate", "description": "Long endurance ride with tempo blocks"},
       {"day": "sunday", "type": "recovery", "duration_minutes": 45, "difficulty": "easy", "description": "Easy recovery spin"}
     ]
   },
   {
     "phase": "peak",
     "weeks": [7, 8],
     "description": "FTP-specific peak work with over-under intervals",
     "weekly_structure": [
       {"day": "tuesday", "type": "threshold", "duration_minutes": 60, "difficulty": "very_hard", "description": "Over-under intervals 3x12"},
       {"day": "thursday", "type": "threshold", "duration_minutes": 60, "difficulty": "hard", "description": "Sustained threshold 2x20"},
       {"day": "saturday", "type": "endurance", "duration_minutes": 90, "difficulty": "moderate", "description": "Endurance ride with threshold surges"},
       {"day": "sunday", "type": "recovery", "duration_minutes": 45, "difficulty": "easy", "description": "Easy recovery spin"}
     ]
   }
 ]'::jsonb,
 ARRAY['ftp', 'threshold', 'sweet-spot', 'power'],
 9
);
```

- [ ] **Step 2: Run migration in Supabase SQL editor**

This migration must be run manually in the Supabase SQL editor (same as other migrations).

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/023_ftp_builder_template.sql
git commit -m "feat: add FTP Builder training plan template"
```

---

## Task 3: Frontend — TrainingPlanTemplate type + service

**Files:**
- Modify: `frontend/src/types/shared.ts`
- Modify: `frontend/src/services/trainingPlanService.ts`

- [ ] **Step 1: Add TrainingPlanTemplate to shared types**

In `frontend/src/types/shared.ts`, add the interface:

```typescript
export interface TrainingPlanTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  target_event: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  duration_weeks: number;
  days_per_week: number;
  hours_per_week_min: number;
  hours_per_week_max: number;
  tags: string[];
  sort_order: number;
}
```

- [ ] **Step 2: Add getTemplates to trainingPlanService**

In `frontend/src/services/trainingPlanService.ts`, add:

```typescript
import type { TrainingPlanTemplate } from '../types/shared';

// Add to the trainingPlanService object:
async getTemplates(filters?: { difficulty?: string; search?: string }): Promise<TrainingPlanTemplate[]> {
  const params = new URLSearchParams();
  if (filters?.difficulty) params.set('difficulty', filters.difficulty);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();
  const url = `/api/training-plans/templates${qs ? `?${qs}` : ''}`;
  const { data, error } = await api.get<{ templates: TrainingPlanTemplate[] }>(url, true);
  if (error || !data) return [];
  return data.templates;
},
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/shared.ts frontend/src/services/trainingPlanService.ts
git commit -m "feat: add TrainingPlanTemplate type and service method (web)"
```

---

## Task 4: Frontend — PlanTemplateCard + PlanTemplateList components

**Files:**
- Create: `frontend/src/components/plans/PlanTemplateCard.tsx`
- Create: `frontend/src/components/plans/PlanTemplateList.tsx`

- [ ] **Step 1: Create PlanTemplateCard**

```typescript
import type { TrainingPlanTemplate } from '../../types/shared';

const DIFFICULTY_COLORS = {
  beginner: { bg: 'bg-green-100', text: 'text-green-700' },
  intermediate: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  advanced: { bg: 'bg-red-100', text: 'text-red-700' },
};

interface PlanTemplateCardProps {
  template: TrainingPlanTemplate;
  onSelect: (template: TrainingPlanTemplate) => void;
}

export function PlanTemplateCard({ template, onSelect }: PlanTemplateCardProps) {
  const colors = DIFFICULTY_COLORS[template.difficulty_level];

  return (
    <button
      onClick={() => onSelect(template)}
      className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/50 hover:shadow-md transition-all w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-foreground text-base">{template.name}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} shrink-0`}>
          {template.difficulty_level}
        </span>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{template.description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{template.duration_weeks} weeks</span>
        <span>{template.days_per_week} days/wk</span>
        <span>{template.hours_per_week_min}–{template.hours_per_week_max} hrs/wk</span>
      </div>

      {template.target_event && (
        <div className="mt-2">
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
            {template.target_event}
          </span>
        </div>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create PlanTemplateList**

```typescript
import { useState, useEffect } from 'react';
import { trainingPlanService } from '../../services/trainingPlanService';
import type { TrainingPlan } from '../../services/trainingPlanService';
import type { TrainingPlanTemplate } from '../../types/shared';
import { PlanTemplateCard } from './PlanTemplateCard';
import { useNavigate } from 'react-router-dom';

const DIFFICULTY_FILTERS = ['all', 'beginner', 'intermediate', 'advanced'] as const;

interface PlanTemplateListProps {
  activePlan: TrainingPlan | null;
}

export function PlanTemplateList({ activePlan }: PlanTemplateListProps) {
  const [templates, setTemplates] = useState<TrainingPlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await trainingPlanService.getTemplates();
      setTemplates(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? templates
    : templates.filter(t => t.difficulty_level === filter);

  const handleSelect = (template: TrainingPlanTemplate) => {
    navigate('/chat', {
      state: { initialMessage: `I'd like to start the ${template.name} training plan.` },
    });
  };

  return (
    <div>
      {/* Active plan banner */}
      {activePlan && (
        <button
          onClick={() => navigate('/training-plan')}
          className="w-full mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left hover:bg-blue-100 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">Active Plan</p>
              <p className="text-sm text-blue-700">{activePlan.goal_event}</p>
            </div>
            <span className="text-xs text-blue-600">View details →</span>
          </div>
        </button>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 mb-4">
        {DIFFICULTY_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">Failed to load plan templates</p>
          <button onClick={loadTemplates} className="text-primary text-sm hover:underline">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No plans match your filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <PlanTemplateCard key={t.id} template={t} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/plans/
git commit -m "feat: add PlanTemplateCard and PlanTemplateList components (web)"
```

---

## Task 5: Frontend — Refactor WorkoutsPage to PlansAndWorkoutsPage

This is the most sensitive task. The existing WorkoutLibrary + WorkoutDetail functionality must be preserved exactly. We wrap it in a tabbed layout alongside the new PlanTemplateList.

**Files:**
- Modify: `frontend/src/pages/WorkoutsPage.tsx`

- [ ] **Step 1: Refactor WorkoutsPage to add tabs**

Replace the contents of `WorkoutsPage.tsx` with a tabbed page. The Workouts tab renders the existing `WorkoutLibrary` and `WorkoutDetail` exactly as before:

```typescript
import { useState, useEffect } from 'react';
import { WorkoutLibrary } from '../components/workout/WorkoutLibrary';
import { WorkoutDetail } from '../components/workout/WorkoutDetail';
import type { Workout } from '../services/workoutService';
import { workoutService } from '../services/workoutService';
import { useNavigate } from 'react-router-dom';
import { PlanTemplateList } from '../components/plans/PlanTemplateList';
import { trainingPlanService } from '../services/trainingPlanService';
import type { TrainingPlan } from '../services/trainingPlanService';

type Tab = 'plans' | 'workouts';

export function WorkoutsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('plans');
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);

  useEffect(() => {
    trainingPlanService.getActivePlan().then(setActivePlan).catch(() => {});
  }, []);

  // --- Existing workout handlers (preserved exactly) ---
  const handleViewWorkout = (workout: Workout) => {
    setSelectedWorkout(workout);
  };

  const handleScheduleWorkout = async () => {
    navigate('/calendar');
    alert('Go to the calendar and drag this workout to a day to schedule it!');
  };

  const handleDownloadZWO = async (workout: Workout) => {
    try {
      await workoutService.downloadZWO(workout.id, workout.name);
    } catch (error) {
      console.error('Failed to download ZWO:', error);
      alert('Failed to download ZWO file. Make sure you have a valid FTP set.');
    }
  };

  const handleDownloadFIT = async (workout: Workout) => {
    try {
      await workoutService.downloadFIT(workout.id, workout.name);
    } catch (error) {
      console.error('Failed to download FIT:', error);
      alert('Failed to download FIT file. Make sure you have a valid FTP set.');
    }
  };

  const handleCreateWorkout = () => {
    navigate('/chat');
    alert('Ask the AI coach to create a workout for you! For example: "Create a 4x8 minute VO2max workout"');
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('plans')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'plans'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Training Plans
        </button>
        <button
          onClick={() => setActiveTab('workouts')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'workouts'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Workouts
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'plans' ? (
        <PlanTemplateList activePlan={activePlan} />
      ) : (
        <>
          <WorkoutLibrary
            onViewWorkout={handleViewWorkout}
            onScheduleWorkout={handleScheduleWorkout}
            onCreateWorkout={handleCreateWorkout}
          />
          {selectedWorkout && (
            <WorkoutDetail
              workout={selectedWorkout}
              onClose={() => setSelectedWorkout(null)}
              onSchedule={handleScheduleWorkout}
              onDownloadZWO={handleDownloadZWO}
              onDownloadFIT={handleDownloadFIT}
            />
          )}
        </>
      )}
    </div>
  );
}
```

Note: We keep the file named `WorkoutsPage.tsx` and the export named `WorkoutsPage` to minimize import changes. The internal behavior changes but the external interface stays the same.

- [ ] **Step 2: Verify frontend compiles and the page renders both tabs**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/WorkoutsPage.tsx
git commit -m "feat: refactor WorkoutsPage to tabbed Plans & Workouts page (web)"
```

---

## Task 6: Frontend — Route + navigation updates

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/navigation/DesktopNav.tsx`
- Modify: `frontend/src/components/navigation/MobileNav.tsx`
- Modify: `frontend/src/pages/TrainingPlanPage.tsx`

- [ ] **Step 1: Update App.tsx routes**

In `frontend/src/App.tsx`, change the workouts route and add a redirect:

```typescript
// Change this line:
<Route path="/workouts" element={<WorkoutsPage />} />
// To:
<Route path="/plans" element={<WorkoutsPage />} />
<Route path="/workouts" element={<Navigate to="/plans" replace />} />
```

- [ ] **Step 2: Update DesktopNav**

In `frontend/src/components/navigation/DesktopNav.tsx`, change the Workouts nav item:

```typescript
// Change:
{ path: '/workouts', label: 'Workouts', Icon: WorkoutsIcon },
// To:
{ path: '/plans', label: 'Plans', Icon: WorkoutsIcon },
```

- [ ] **Step 3: Update MobileNav**

In `frontend/src/components/navigation/MobileNav.tsx`, change the Plan nav item to point to the new combined page. Note: the web MobileNav does NOT have a Workouts entry — it has "Plan" pointing to `/training-plan`. We replace this with `/plans` because the Plans tab has an active plan banner that links to `/training-plan` for detail. The `/training-plan` route still exists and is accessible via the banner or direct URL.

```typescript
// Change:
{ path: '/training-plan', label: 'Plan', Icon: TrainingPlanIcon },
// To:
{ path: '/plans', label: 'Plans', Icon: TrainingPlanIcon },
```

- [ ] **Step 4: Update TrainingPlanPage empty state**

In `frontend/src/pages/TrainingPlanPage.tsx`, change `handleBrowsePlans` to navigate to the new page:

```typescript
// Change:
const handleBrowsePlans = () => {
  navigate('/chat', {
    state: {
      initialMessage: 'Show me your pre-built training plans',
    },
  });
};
// To:
const handleBrowsePlans = () => {
  navigate('/plans');
};
```

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/navigation/DesktopNav.tsx frontend/src/components/navigation/MobileNav.tsx frontend/src/pages/TrainingPlanPage.tsx
git commit -m "feat: update routes and nav to use /plans path (web)"
```

---

## Task 7: Frontend — Chat "Browse Plans" quick-action + suggested prompt

**Files:**
- Modify: `frontend/src/pages/ChatPage.tsx`

- [ ] **Step 1: Read ChatPage.tsx fully to understand current layout**

Read the file to find where to add the quick-action button and suggested prompt. The quick-action should appear above the input area. The suggested prompt should appear when there's no active plan and the conversation is new/empty.

- [ ] **Step 2: Add "Browse Plans" quick-action button**

Add a button above or near the chat input that navigates to `/plans`:

```typescript
// Add a "Browse Plans" button near the chat input area
<button
  onClick={() => navigate('/plans')}
  className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
>
  Browse Plans
</button>
```

- [ ] **Step 3: Add suggested prompt chip when no active plan**

Fetch the active plan status on mount. If no active plan and conversation is empty, show a tappable chip:

```typescript
// Suggested prompt — only when no active plan and empty conversation
{!activePlan && messages.length === 0 && (
  <button
    onClick={() => handleSendMessage('Help me pick a training plan')}
    className="text-sm px-4 py-2 rounded-full border border-border text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
  >
    Help me pick a training plan
  </button>
)}
```

The exact placement depends on ChatPage's current structure — adapt to fit the existing layout patterns.

- [ ] **Step 4: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ChatPage.tsx
git commit -m "feat: add Browse Plans quick-action and suggested prompt to chat (web)"
```

---

## Task 8: Mobile — TrainingPlanTemplate type + service

**Files:**
- Modify: `mobile/src/types/shared.ts`
- Modify: `mobile/src/services/trainingPlanService.ts`

- [ ] **Step 1: Add TrainingPlanTemplate to mobile shared types**

In `mobile/src/types/shared.ts`, add the same interface as frontend:

```typescript
export interface TrainingPlanTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  target_event: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  duration_weeks: number;
  days_per_week: number;
  hours_per_week_min: number;
  hours_per_week_max: number;
  tags: string[];
  sort_order: number;
}
```

- [ ] **Step 2: Add getTemplates to mobile trainingPlanService**

In `mobile/src/services/trainingPlanService.ts`, add:

```typescript
import type { TrainingPlanTemplate } from '../types/shared';

// Add to the trainingPlanService object:
async getTemplates(filters?: { difficulty?: string; search?: string }): Promise<TrainingPlanTemplate[]> {
  const params = new URLSearchParams();
  if (filters?.difficulty) params.set('difficulty', filters.difficulty);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();
  const { data } = await apiClient.get<{ templates: TrainingPlanTemplate[] }>(
    `/api/training-plans/templates${qs ? `?${qs}` : ''}`
  );
  return data?.templates || [];
},
```

- [ ] **Step 3: Verify mobile compiles**

Run: `cd mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors in client.ts)

- [ ] **Step 4: Commit**

```bash
git add mobile/src/types/shared.ts mobile/src/services/trainingPlanService.ts
git commit -m "feat: add TrainingPlanTemplate type and service method (mobile)"
```

---

## Task 9: Mobile — PlanTemplateCard + PlanTemplateList components

**Files:**
- Create: `mobile/src/components/plans/PlanTemplateCard.tsx`
- Create: `mobile/src/components/plans/PlanTemplateList.tsx`

- [ ] **Step 1: Create mobile PlanTemplateCard**

```typescript
import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import type { TrainingPlanTemplate } from '../../types/shared';
import Badge from '../ui/Badge';

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner: { bg: '#052e16', text: '#4ade80' },
  intermediate: { bg: '#2d1f00', text: '#fbbf24' },
  advanced: { bg: '#3f1020', text: '#f87171' },
};

interface PlanTemplateCardProps {
  template: TrainingPlanTemplate;
  onSelect: (template: TrainingPlanTemplate) => void;
}

export default function PlanTemplateCard({ template, onSelect }: PlanTemplateCardProps) {
  const colors = DIFFICULTY_COLORS[template.difficulty_level] || DIFFICULTY_COLORS.intermediate;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onSelect(template)}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{template.name}</Text>
        <Badge
          label={template.difficulty_level}
          color={colors.bg}
          textColor={colors.text}
        />
      </View>

      <Text style={styles.description} numberOfLines={2}>{template.description}</Text>

      <View style={styles.meta}>
        <Text style={styles.metaText}>{template.duration_weeks} weeks</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{template.days_per_week} days/wk</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>{template.hours_per_week_min}–{template.hours_per_week_max} hrs/wk</Text>
      </View>

      {template.target_event && (
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{template.target_event}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  description: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 18,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: { fontSize: 12, color: '#64748b' },
  metaDot: { fontSize: 12, color: '#475569' },
  tagRow: { flexDirection: 'row', marginTop: 4 },
  tag: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, color: '#64748b' },
});
```

- [ ] **Step 2: Create mobile PlanTemplateList**

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../../navigation/types';
import { trainingPlanService } from '../../services/trainingPlanService';
import type { TrainingPlan } from '../../services/trainingPlanService';
import type { TrainingPlanTemplate } from '../../types/shared';
import PlanTemplateCard from './PlanTemplateCard';
import EmptyState from '../ui/EmptyState';

const FILTERS = ['all', 'beginner', 'intermediate', 'advanced'] as const;

interface PlanTemplateListProps {
  activePlan: TrainingPlan | null;
}

export default function PlanTemplateList({ activePlan }: PlanTemplateListProps) {
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [templates, setTemplates] = useState<TrainingPlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await trainingPlanService.getTemplates();
      setTemplates(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? templates
    : templates.filter(t => t.difficulty_level === filter);

  const handleSelect = (template: TrainingPlanTemplate) => {
    navigation.navigate('Chat', {
      initialMessage: `I'd like to start the ${template.name} training plan.`,
    });
  };

  const renderHeader = () => (
    <View>
      {/* Active plan banner — informational only on mobile (no standalone TrainingPlan screen in tab nav) */}
      {activePlan && (
        <View style={styles.banner}>
          <View>
            <Text style={styles.bannerLabel}>Active Plan</Text>
            <Text style={styles.bannerTitle}>{activePlan.goal_event}</Text>
          </View>
        </View>
      )}

      {/* Filter chips */}
      <FlatList
        data={[...FILTERS]}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={f => f}
        style={styles.filterList}
        contentContainerStyle={styles.filterContent}
        renderItem={({ item: f }) => (
          <TouchableOpacity
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        {renderHeader()}
        <EmptyState
          icon="alert-circle-outline"
          title="Failed to load plans"
          subtitle="Tap to retry"
          actionLabel="Retry"
          onAction={loadTemplates}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        renderItem={({ item }) => (
          <PlanTemplateCard template={item} onSelect={handleSelect} />
        )}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            icon="calendar-outline"
            title="No plans match your filter"
            subtitle="Try a different difficulty level"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, paddingTop: 0 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e3a5f',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
  },
  bannerLabel: { fontSize: 11, color: '#93c5fd', fontWeight: '500' },
  bannerTitle: { fontSize: 14, color: '#f1f5f9', fontWeight: '600', marginTop: 2 },
  bannerArrow: { fontSize: 12, color: '#60a5fa' },
  filterList: { maxHeight: 52 },
  filterContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1e293b',
  },
  chipActive: { backgroundColor: '#1e3a5f' },
  chipText: { color: '#64748b', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#60a5fa' },
});
```

- [ ] **Step 3: Verify mobile compiles**

Run: `cd mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors)

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/plans/
git commit -m "feat: add PlanTemplateCard and PlanTemplateList components (mobile)"
```

---

## Task 10: Mobile — Refactor WorkoutsScreen to tabbed screen

This is the most sensitive mobile task. Preserve all existing workout browsing, filtering, detail sheet, and bottom sheet behavior exactly.

**Files:**
- Modify: `mobile/src/screens/WorkoutsScreen.tsx`

- [ ] **Step 1: Add tab state and PlanTemplateList to WorkoutsScreen**

Wrap existing content in a tab structure. The "Workouts" tab renders everything that currently exists unchanged. The "Plans" tab renders `PlanTemplateList`.

Add imports at top:
```typescript
import PlanTemplateList from '../components/plans/PlanTemplateList';
import { trainingPlanService } from '../services/trainingPlanService';
import type { TrainingPlan } from '../services/trainingPlanService';
```

Add state:
```typescript
const [activeTab, setActiveTab] = useState<'plans' | 'workouts'>('plans');
const [activePlan, setActivePlan] = useState<TrainingPlan | null>(null);

useEffect(() => {
  trainingPlanService.getActivePlan().then(setActivePlan).catch(() => {});
}, []);
```

Add tab bar just inside the SafeAreaView, before the filter list:
```typescript
{/* Tab bar */}
<View style={styles.tabBar}>
  <TouchableOpacity
    style={[styles.tab, activeTab === 'plans' && styles.tabActive]}
    onPress={() => setActiveTab('plans')}
  >
    <Text style={[styles.tabText, activeTab === 'plans' && styles.tabTextActive]}>
      Training Plans
    </Text>
  </TouchableOpacity>
  <TouchableOpacity
    style={[styles.tab, activeTab === 'workouts' && styles.tabActive]}
    onPress={() => setActiveTab('workouts')}
  >
    <Text style={[styles.tabText, activeTab === 'workouts' && styles.tabTextActive]}>
      Workouts
    </Text>
  </TouchableOpacity>
</View>
```

Conditionally render either PlanTemplateList or existing workout content based on `activeTab`.

Add tab styles:
```typescript
tabBar: {
  flexDirection: 'row',
  borderBottomWidth: 1,
  borderBottomColor: '#1e293b',
},
tab: {
  flex: 1,
  paddingVertical: 12,
  alignItems: 'center',
  borderBottomWidth: 2,
  borderBottomColor: 'transparent',
},
tabActive: {
  borderBottomColor: '#3b82f6',
},
tabText: {
  fontSize: 14,
  fontWeight: '500',
  color: '#64748b',
},
tabTextActive: {
  color: '#f1f5f9',
},
```

- [ ] **Step 2: Verify mobile compiles and both tabs work**

Run: `cd mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors)

- [ ] **Step 3: Commit**

```bash
git add mobile/src/screens/WorkoutsScreen.tsx
git commit -m "feat: refactor WorkoutsScreen to tabbed Plans & Workouts screen (mobile)"
```

---

## Task 11: Mobile — Navigation type + tab updates

**Files:**
- Modify: `mobile/src/navigation/types.ts`
- Modify: `mobile/src/navigation/MainTabNavigator.tsx`
- Modify: `mobile/src/screens/TrainingPlanScreen.tsx`

- [ ] **Step 1: Update MainTabParamList**

In `mobile/src/navigation/types.ts`, rename the key:

```typescript
// Change:
Workouts: undefined;
// To:
Plans: undefined;
```

- [ ] **Step 2: Update MainTabNavigator**

In `mobile/src/navigation/MainTabNavigator.tsx`, update the Workouts tab:

```typescript
// Change the Tab.Screen:
<Tab.Screen
  name="Plans"
  component={WorkoutsScreen}
  options={{
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="clipboard-outline" size={size} color={color} />
    ),
  }}
/>
```

- [ ] **Step 3: Fix any references to 'Workouts' tab name**

Search the mobile codebase for any `navigate('Workouts')` calls and update them to `navigate('Plans')`. Common locations:
- `mobile/src/screens/TrainingPlanScreen.tsx` — update "Browse Plans" button to navigate to Plans tab

In `TrainingPlanScreen.tsx`, update the empty state:
```typescript
// Change:
onAction={() => navigation?.navigate?.('Chat', { initialMessage: 'Show me your pre-built training plans' })}
// To:
onAction={() => navigation?.navigate?.('Plans')}
```

- [ ] **Step 4: Verify mobile compiles**

Run: `cd mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors). If there are compile errors about 'Workouts' type, grep for remaining references and fix them.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/navigation/types.ts mobile/src/navigation/MainTabNavigator.tsx mobile/src/screens/TrainingPlanScreen.tsx
git commit -m "feat: rename Workouts tab to Plans in mobile navigation"
```

---

## Task 12: Mobile — Chat "Browse Plans" quick-action + suggested prompt

**Files:**
- Modify: `mobile/src/screens/ChatScreen.tsx`

- [ ] **Step 1: Read ChatScreen.tsx fully to understand layout**

Read the file to find where to add the quick-action button and suggested prompt chip.

- [ ] **Step 2: Add "Browse Plans" quick-action**

Add a button near the input area that navigates to the Plans tab:

```typescript
<TouchableOpacity
  style={styles.quickAction}
  onPress={() => navigation.navigate('Plans')}
>
  <Text style={styles.quickActionText}>Browse Plans</Text>
</TouchableOpacity>
```

- [ ] **Step 3: Add suggested prompt when no active plan**

Fetch active plan on mount. If no active plan and conversation messages are empty, show a tappable chip:

```typescript
{!activePlan && messages.length === 0 && (
  <TouchableOpacity
    style={styles.suggestedPrompt}
    onPress={() => handleSend('Help me pick a training plan')}
  >
    <Text style={styles.suggestedPromptText}>Help me pick a training plan</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 4: Verify mobile compiles**

Run: `cd mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors)

- [ ] **Step 5: Commit**

```bash
git add mobile/src/screens/ChatScreen.tsx
git commit -m "feat: add Browse Plans quick-action and suggested prompt to chat (mobile)"
```

---

## Task 13: Regression verification

This task verifies nothing is broken.

- [ ] **Step 1: Verify backend compiles clean**

Run: `cd backend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Verify frontend compiles clean**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify mobile compiles clean**

Run: `cd mobile && npx tsc --noEmit`
Expected: No errors (or only pre-existing client.ts errors)

- [ ] **Step 4: Grep for broken references**

Search for any remaining references to the old 'Workouts' navigation key or `/workouts` route that weren't updated:

```bash
# Check for mobile nav references to old key
grep -r "navigate.*'Workouts'" mobile/src/ --include="*.ts" --include="*.tsx"

# Check for web route references
grep -r "'/workouts'" frontend/src/ --include="*.ts" --include="*.tsx"
```

Any hits (except the redirect in App.tsx) need to be updated.

- [ ] **Step 5: Verify all existing API routes are untouched**

Confirm the following endpoints still exist and are unchanged:
- `GET /api/training-plans/active`
- `GET /api/training-plans/:planId`
- `DELETE /api/training-plans/:planId`
- All `/api/workouts/*` routes
- All `/api/calendar/*` routes

- [ ] **Step 6: Commit any fixes if needed**
