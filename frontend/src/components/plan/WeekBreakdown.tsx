import { useState } from 'react';
import type { TrainingWeek } from '../../services/trainingPlanService';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface WeekBreakdownProps {
  weeks: TrainingWeek[];
  startDate: string;
}

export function WeekBreakdown({ weeks, startDate }: WeekBreakdownProps) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set([1]));

  const phaseColors = {
    base: 'border-blue-500 bg-card',
    build: 'border-orange-500 bg-card',
    peak: 'border-red-500 bg-card',
    taper: 'border-green-500 bg-card',
  };

  const phaseBadgeColors = {
    base: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    build: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    peak: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    taper: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const toggleWeek = (weekNumber: number) => {
    const newExpanded = new Set(expandedWeeks);
    if (newExpanded.has(weekNumber)) {
      newExpanded.delete(weekNumber);
    } else {
      newExpanded.add(weekNumber);
    }
    setExpandedWeeks(newExpanded);
  };

  const getWeekDates = (weekNumber: number) => {
    const [y, mo, d] = startDate.split('-').map(Number);
    const start = new Date(y, mo - 1, d);
    start.setDate(start.getDate() + (weekNumber - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    return {
      start: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      end: end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  };

  return (
    <div className="space-y-4">
      {weeks.map((week) => {
        const isExpanded = expandedWeeks.has(week.week_number);
        const dates = getWeekDates(week.week_number);

        return (
          <div
            key={week.week_number}
            className={`border-l-4 ${phaseColors[week.phase]} rounded-lg overflow-hidden`}
          >
            <button
              onClick={() => toggleWeek(week.week_number)}
              className="w-full p-4 flex items-center justify-between hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-4">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                )}
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-foreground">Week {week.week_number}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${phaseBadgeColors[week.phase]}`}>
                      {week.phase.charAt(0).toUpperCase() + week.phase.slice(1)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {dates.start} - {dates.end} • {week.workouts.length} workouts • {week.tss} TSS
                  </p>
                  {week.notes && (
                    <p className="text-sm text-muted-foreground italic mt-1">{week.notes}</p>
                  )}
                </div>
              </div>
            </button>

            {isExpanded && (
              <div className="p-4 pt-0">
                <div className="space-y-3">
                  {week.workouts.map((workout, idx) => (
                    <div
                      key={idx}
                      className="bg-muted rounded-lg p-4 border border-border"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-foreground">{workout.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {dayNames[workout.day_of_week]}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-foreground">{workout.duration_minutes} min</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {workout.workout_type}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">{workout.description}</p>
                      {workout.rationale && (
                        <p className="text-xs text-muted-foreground italic mt-2 border-t border-border pt-2">
                          💡 {workout.rationale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
