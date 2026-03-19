# Plans & Workouts — Browsable Training Plan Templates

**Date:** 2026-03-19
**Status:** Draft

## Problem

Users must go through the AI chat to discover and start a training plan. There's no way to browse available plans at a glance. The existing `training_plan_templates` table (8 curated plans) and `workout_templates` table (~80 workouts) are only accessible through AI tool calls. Users who know what they want should be able to browse, pick, and go.

## Solution

Replace the current Workouts tab (4th tab on mobile, `/workouts` route on web) with a combined **"Plans & Workouts"** page with two tabs:

1. **Training Plans** — Browse curated plan templates, select one to hand off to the AI coach via chat
2. **Workouts** — Browse individual workout templates, view details, schedule directly to calendar

Additionally, the AI coach can surface plan templates conversationally via a quick-action button and suggested prompts.

## Scope

### In Scope
- Combined tabbed page replacing current Workouts page (web + mobile)
- Training Plans tab with cards and difficulty filter
- Workouts tab (migrating existing WorkoutsPage/WorkoutsScreen functionality)
- Chat handoff when selecting a plan template
- Chat quick-action "Browse Plans" button
- Coach suggested prompt when no active plan
- New FTP Builder plan template (DB seed)
- Backend endpoint to list training plan templates

### Out of Scope
- Rich card message types in chat (coach uses text + existing tools)
- Inline plan editing before scheduling
- Workout template builder/editor
- User-created plan templates

## Relationship to Existing Pages

- **`TrainingPlanPage.tsx` (web, `/training-plan` route)** and **`TrainingPlanScreen.tsx` (mobile)** remain as-is. They show the active plan detail view (overview, week breakdown, cancel). The new Plans tab links to them via the active plan banner.
- The existing "Browse Plans" and "Custom Plan with AI" buttons on the empty state of `TrainingPlanPage`/`TrainingPlanScreen` should be updated to navigate to the new Plans & Workouts page (Plans tab) and Chat respectively, so there's one canonical browse experience.

## Architecture

### Page Structure

**Default tab**: Training Plans (first tab). Tab selection does not persist across visits.

#### Tab 1: Training Plans

**Active Plan Banner** (conditional)
- If athlete has an active plan: show a summary banner at the top (plan name, current week/phase). Tapping navigates to `TrainingPlanPage` (web: `/training-plan`) or pushes `TrainingPlanScreen` (mobile stack nav).
- If no active plan: hide banner, show full template list

**Filter Chips**
- All | Beginner | Intermediate | Advanced

**Plan Template Cards** (grid on web, vertical list on mobile)
Each card displays:
- Plan name
- Difficulty badge (color-coded: green/beginner, yellow/intermediate, red/advanced)
- Duration in weeks
- Days per week
- Hours per week range (e.g., "6–8 hrs/wk")
- Brief description (2 lines, truncated)
- Target event/goal tag (e.g., "Century", "Criterium", "General Fitness")

**Tap Action**: Navigate to Chat screen with pre-filled message:
> "I'd like to start the [Plan Name] training plan."

The coach then personalizes: asks about start date, available days, current fitness, FTP, etc., then calls `schedule_training_plan_template` to place it on the calendar.

#### Tab 2: Workouts

Migrates existing functionality from `WorkoutsPage.tsx` (web) and `WorkoutsScreen.tsx` (mobile):

**Filter Chips**
- All | Endurance | Tempo | Threshold | VO2max | Sprint | Recovery

**Search Bar**
- Text filter by workout name

**Workout Cards** (list)
Each card displays:
- Workout name
- Type badge (color-coded by workout_type)
- Duration (minutes)
- TSS estimate

Note: `workout_templates` has a `difficulty` column. Use it on cards if populated; omit if null.

**Tap Action**: Opens detail modal/sheet showing:
- Full description
- Interval breakdown (visual or text)
- Duration, TSS, difficulty (if available)
- "Schedule" button → date picker → `POST /api/calendar` to schedule

### Chat Integration

**Quick-Action Button**
- "Browse Plans" button visible above chat input (alongside existing quick actions if any)
- Tapping navigates to the Plans & Workouts page (Plans tab)

**Suggested Prompt** (frontend-only implementation)
- On conversation start, frontend checks for active plan (already fetched by `trainingPlanService.getActivePlan()`)
- If no active plan, render a tappable chip: "Help me pick a training plan"
- Tapping sends the message, coach initiates the conversational filter flow:
  1. "What are you training for?" (event type or general fitness goal)
  2. "What's your experience level?"
  3. Coach calls `get_training_plan_templates` with filters, recommends 2-3 plans with reasoning
  4. User picks one, coach schedules it

**Organic Surfacing**
- When a user asks about goals, getting faster, training structure, etc., the coach can proactively call `get_training_plan_templates` and recommend relevant templates as part of normal conversation

### Data

#### New Plan Template: FTP Builder

Add to `training_plan_templates` via migration:

```
Name: FTP Builder
Slug: ftp-builder
Description: Progressive plan focused on raising your functional threshold power through sweet spot and threshold work.
Target Event: General Fitness
Difficulty: Intermediate
Duration: 8 weeks
Days per week: 3-4
Hours per week: 6-9
Phases: Base (2 wk) → Build (4 wk) → Peak (2 wk)
```

#### TrainingPlanTemplate Interface

```typescript
interface TrainingPlanTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  target_event: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  duration_weeks: number;
  days_per_week: number;
  hours_per_week_min: number;
  hours_per_week_max: number;
  tags: string[];
  sort_order: number;
  // Note: `phases` JSONB column is NOT returned by the list endpoint (large payload, not needed for cards).
  // If a detail view is added later, a GET /templates/:id endpoint can return phases.
}
```

Define in `backend/src/types/trainingPlan.ts`, mirror in `frontend/src/types/shared.ts` and `mobile/src/types/shared.ts`.

#### New Backend Endpoint

`GET /api/training-plans/templates`
- Returns all rows from `training_plan_templates` table (excluding `phases` column)
- Optional query params: `?difficulty=beginner&search=<term>`
  - `difficulty`: exact match on `difficulty_level`
  - `search`: ilike match against `name` and `description` columns
- Ordered by `sort_order ASC`
- Auth required (authenticateJWT + checkSubscription)
- Response: `{ templates: TrainingPlanTemplate[] }`

The existing `get_training_plan_templates` AI tool already queries this table. The new endpoint exposes the same data to the frontend/mobile directly.

### File Changes

#### Backend
| File | Change |
|------|--------|
| `backend/migrations/015_ftp_builder_template.sql` | New migration: INSERT FTP Builder plan template |
| `backend/src/routes/trainingPlanRoutes.ts` | Add `GET /templates` route |
| `backend/src/controllers/trainingPlanController.ts` | Add `getTemplates` handler |

#### Frontend (Web)
| File | Change |
|------|--------|
| `frontend/src/pages/WorkoutsPage.tsx` | Rename/refactor to `PlansAndWorkoutsPage.tsx` with tab structure |
| `frontend/src/components/plans/PlanTemplateCard.tsx` | New: plan template card component |
| `frontend/src/components/plans/PlanTemplateList.tsx` | New: filtered grid of plan template cards |
| `frontend/src/services/trainingPlanService.ts` | Add `getTemplates()` method |
| `frontend/src/types/shared.ts` | Add `TrainingPlanTemplate` interface |
| `frontend/src/App.tsx` | Change route path from `/workouts` to `/plans`, add redirect from `/workouts` → `/plans` |
| `frontend/src/components/layout/DesktopNav.tsx` | Rename "Workouts" nav item to "Plans", update icon |
| `frontend/src/components/layout/MobileNav.tsx` | Rename "Workouts" nav item to "Plans", update icon |
| `frontend/src/pages/TrainingPlanPage.tsx` | Update empty-state "Browse Plans" button to navigate to `/plans` |
| `frontend/src/pages/ChatPage.tsx` | Add "Browse Plans" quick-action button |

#### Mobile
| File | Change |
|------|--------|
| `mobile/src/screens/WorkoutsScreen.tsx` | Refactor to tabbed `PlansAndWorkoutsScreen.tsx` |
| `mobile/src/components/plans/PlanTemplateCard.tsx` | New: plan template card component |
| `mobile/src/components/plans/PlanTemplateList.tsx` | New: filtered list of plan template cards |
| `mobile/src/services/trainingPlanService.ts` | Add `getTemplates()` method |
| `mobile/src/types/shared.ts` | Add `TrainingPlanTemplate` interface |
| `mobile/src/navigation/MainTabNavigator.tsx` | Rename tab to "Plans", update icon, rename screen key |
| `mobile/src/navigation/types.ts` | Rename `Workouts` → `Plans` in `MainTabParamList` |
| `mobile/src/screens/TrainingPlanScreen.tsx` | Update empty-state "Browse Plans" button to navigate to Plans tab |
| `mobile/src/screens/ChatScreen.tsx` | Add "Browse Plans" quick-action button |

### Navigation Flow

```
Plans & Workouts Page
├── [Training Plans tab]
│   ├── Filter: All / Beginner / Intermediate / Advanced
│   ├── Active plan banner → TrainingPlanPage (existing)
│   └── Plan cards → tap → Chat screen (pre-filled message)
│       └── Coach personalizes → schedules to calendar
│
└── [Workouts tab]
    ├── Filter: All / Endurance / Tempo / Threshold / ...
    ├── Search bar
    └── Workout cards → tap → Detail modal
        └── "Schedule" → Date picker → POST /api/calendar

Chat Screen
├── Quick-action: "Browse Plans" → navigates to Plans tab
├── Suggested prompt: "Help me pick a training plan"
└── Organic: coach surfaces templates when relevant
```

### Error Handling

- **No templates returned**: Show empty state with message "No plans match your filters"
- **Network error loading templates**: Show retry button
- **Chat handoff fails**: User lands in chat with pre-filled text; if chat errors, standard chat error handling applies
- **Scheduling conflict**: Coach handles via conversation (existing behavior)

### Testing

- Backend: unit test for `GET /api/training-plans/templates` endpoint (filters, auth)
- Frontend: Plan template cards render with correct data, tab switching works, chat navigation passes correct params
- Mobile: Same as frontend, plus bottom sheet detail view for workouts
- E2E: Select plan → lands in chat → coach acknowledges plan selection
