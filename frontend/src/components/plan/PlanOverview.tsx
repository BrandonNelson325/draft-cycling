import type { TrainingPlan } from '../../services/trainingPlanService';

interface PlanOverviewProps {
  plan: TrainingPlan;
}

export function PlanOverview({ plan }: PlanOverviewProps) {
  const phaseColors = {
    base: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    build: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    peak: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    taper: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  const phaseWeeks = {
    base: plan.weeks.filter((w) => w.phase === 'base').length,
    build: plan.weeks.filter((w) => w.phase === 'build').length,
    peak: plan.weeks.filter((w) => w.phase === 'peak').length,
    taper: plan.weeks.filter((w) => w.phase === 'taper').length,
  };

  const formatDate = (dateStr: string) => {
    const [y, mo, d] = dateStr.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-card rounded-lg shadow p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Goal Event</h3>
          <p className="text-2xl font-bold text-foreground">{plan.goal_event}</p>
          <p className="text-muted-foreground mt-1">{formatDate(plan.event_date)}</p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Plan Duration</h3>
          <p className="text-2xl font-bold text-foreground">{plan.weeks.length} weeks</p>
          <p className="text-muted-foreground mt-1">
            {formatDate(plan.start_date)} → {formatDate(plan.event_date)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Total TSS</p>
          <p className="text-2xl font-bold text-foreground">{plan.total_tss}</p>
        </div>

        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Total Workouts</p>
          <p className="text-2xl font-bold text-foreground">
            {plan.weeks.reduce((sum, week) => sum + week.workouts.length, 0)}
          </p>
        </div>

        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Avg Weekly TSS</p>
          <p className="text-2xl font-bold text-foreground">
            {Math.round(plan.total_tss / plan.weeks.length)}
          </p>
        </div>

        <div className="text-center p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Workouts/Week</p>
          <p className="text-2xl font-bold text-foreground">
            {(
              plan.weeks.reduce((sum, week) => sum + week.workouts.length, 0) /
              plan.weeks.length
            ).toFixed(1)}
          </p>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Training Phases</h3>
        <div className="flex gap-2 flex-wrap">
          {phaseWeeks.base > 0 && (
            <div className={`px-3 py-2 rounded-lg ${phaseColors.base}`}>
              <span className="font-semibold">Base:</span> {phaseWeeks.base} weeks
            </div>
          )}
          {phaseWeeks.build > 0 && (
            <div className={`px-3 py-2 rounded-lg ${phaseColors.build}`}>
              <span className="font-semibold">Build:</span> {phaseWeeks.build} weeks
            </div>
          )}
          {phaseWeeks.peak > 0 && (
            <div className={`px-3 py-2 rounded-lg ${phaseColors.peak}`}>
              <span className="font-semibold">Peak:</span> {phaseWeeks.peak} weeks
            </div>
          )}
          {phaseWeeks.taper > 0 && (
            <div className={`px-3 py-2 rounded-lg ${phaseColors.taper}`}>
              <span className="font-semibold">Taper:</span> {phaseWeeks.taper} weeks
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
