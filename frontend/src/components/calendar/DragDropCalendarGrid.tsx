import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { DroppableCalendarDay } from './DroppableCalendarDay';
import type { CalendarEntry, StravaActivity } from '../../services/calendarService';
import { calendarService } from '../../services/calendarService';
import { trainingPlanService } from '../../services/trainingPlanService';
import type { TrainingPlan } from '../../services/trainingPlanService';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface DragDropCalendarGridProps {
  onWorkoutClick?: (entry: CalendarEntry) => void;
  onDayClick?: (date: Date, entries: CalendarEntry[]) => void;
  refreshTrigger?: number; // Optional prop to trigger refresh from parent
}

export function DragDropCalendarGrid({
  onWorkoutClick,
  onDayClick,
  refreshTrigger,
}: DragDropCalendarGridProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [scheduledWorkouts, setScheduledWorkouts] = useState<CalendarEntry[]>([]);
  const [stravaActivities, setStravaActivities] = useState<StravaActivity[]>([]);
  const [trainingPlan, setTrainingPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Load calendar entries and training plan
  useEffect(() => {
    loadCalendarData();
  }, [currentDate, refreshTrigger]);

  const loadCalendarData = async () => {
    await Promise.all([
      loadCalendarEntries(),
      loadTrainingPlan()
    ]);
  };

  const loadTrainingPlan = async () => {
    try {
      const plan = await trainingPlanService.getActivePlan();
      setTrainingPlan(plan);
    } catch (err) {
      // No active plan is okay
      setTrainingPlan(null);
    }
  };

  const loadCalendarEntries = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get first and last day of month view (including prev/next month days)
      const firstDayOfMonth = new Date(year, month, 1);
      const lastDayOfMonth = new Date(year, month + 1, 0);

      // Calculate start date (first Sunday before or on month start)
      const startDate = new Date(firstDayOfMonth);
      startDate.setDate(startDate.getDate() - firstDayOfMonth.getDay());

      // Calculate number of days from previous month shown
      const prevMonthDaysCount = firstDayOfMonth.getDay();
      const currentMonthDaysCount = lastDayOfMonth.getDate();

      // Calendar always shows 6 weeks (42 days), so calculate end date accordingly
      const totalDaysToShow = 42;
      const nextMonthDaysCount = totalDaysToShow - prevMonthDaysCount - currentMonthDaysCount;

      // Calculate end date by adding all the days needed
      const endDate = new Date(year, month + 1, nextMonthDaysCount);

      const data = await calendarService.getCalendar(startDate, endDate);
      setScheduledWorkouts(data.scheduledWorkouts);
      setStravaActivities(data.stravaActivities);
    } catch (err: any) {
      setError(err.message || 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  };

  // Calculate calendar grid days
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDay = firstDayOfMonth.getDay();

  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = Array.from(
    { length: startDay },
    (_, i) => new Date(year, month - 1, daysInPrevMonth - startDay + i + 1)
  );

  const currentMonthDays = Array.from(
    { length: lastDayOfMonth.getDate() },
    (_, i) => new Date(year, month, i + 1)
  );

  const remainingDays = 42 - (prevMonthDays.length + currentMonthDays.length);
  const nextMonthDays = Array.from(
    { length: remainingDays },
    (_, i) => new Date(year, month + 1, i + 1)
  );

  const allDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  // Helper function to parse date string as local date (not UTC)
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Group scheduled workouts by date
  const workoutsByDate = scheduledWorkouts.reduce((acc, entry) => {
    const date = parseLocalDate(entry.scheduled_date).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, CalendarEntry[]>);

  // Group Strava activities by date
  const activitiesByDate = stravaActivities.reduce((acc, activity) => {
    const date = parseLocalDate(activity.start_date).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(activity);
    return acc;
  }, {} as Record<string, StravaActivity[]>);

  // Handle drop event
  const handleDrop = async (item: any, date: Date) => {
    try {
      if (item.calendarEntryId && item.scheduled) {
        // Moving existing scheduled workout
        await calendarService.moveWorkout(item.calendarEntryId, date);
      } else if (item.workout) {
        // Scheduling new workout from library
        await calendarService.scheduleWorkout(item.workout.id, date);
      }

      // Reload calendar
      await loadCalendarEntries();
    } catch (err: any) {
      alert(err.message || 'Failed to schedule workout');
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Helper function to get week number and phase for a date
  const getWeekInfo = (date: Date) => {
    if (!trainingPlan) return null;

    const planStart = parseLocalDate(trainingPlan.start_date);
    const daysSinceStart = Math.floor((date.getTime() - planStart.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(daysSinceStart / 7) + 1;

    if (weekNumber < 1 || weekNumber > trainingPlan.weeks.length) {
      return null;
    }

    const week = trainingPlan.weeks[weekNumber - 1];
    return {
      weekNumber,
      phase: week.phase,
      weekTSS: week.tss
    };
  };

  // Group days into weeks (rows of 7)
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  // Calculate actual TSS for a week (from scheduled workouts and Strava activities)
  const getWeekActualTSS = (weekDays: Date[]) => {
    let totalTSS = 0;
    weekDays.forEach(date => {
      const dateString = date.toDateString();

      // TSS from scheduled workouts
      const dayWorkouts = workoutsByDate[dateString] || [];
      dayWorkouts.forEach(entry => {
        if (entry.workouts?.tss) {
          totalTSS += entry.workouts.tss;
        }
      });

      // TSS from Strava activities
      const dayActivities = activitiesByDate[dateString] || [];
      dayActivities.forEach(activity => {
        if (activity.tss) {
          totalTSS += activity.tss;
        }
      });
    });
    return totalTSS;
  };

  const phaseColors = {
    base: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300 dark:border-blue-700',
    build: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300 dark:border-orange-700',
    peak: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-300 dark:border-red-700',
    taper: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-300 dark:border-green-700',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {monthNames[month]} {year}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevMonth}>
              ←
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handleNextMonth}>
              →
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-lg">
            <p className="text-destructive text-sm">{error}</p>
          </div>
        )}

        {/* Day names */}
        <div className="grid grid-cols-7 gap-2">
          {dayNames.map((day) => (
            <div
              key={day}
              className="text-center text-sm font-medium text-muted-foreground p-2"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid with weekly summaries */}
        <div className="space-y-2">
          {weeks.map((weekDays, weekIndex) => {
            const firstDayOfWeek = weekDays[0];
            const weekInfo = getWeekInfo(firstDayOfWeek);
            const actualTSS = getWeekActualTSS(weekDays);

            return (
              <div key={weekIndex}>
                {/* Weekly Summary Row */}
                {weekInfo && (
                  <div className={`flex items-center justify-between px-3 py-1.5 rounded-lg border text-xs font-medium ${phaseColors[weekInfo.phase]}`}>
                    <div className="flex items-center gap-3">
                      <span>Week {weekInfo.weekNumber}</span>
                      <span className="capitalize">{weekInfo.phase} Phase</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>
                        TSS: {actualTSS} / {weekInfo.weekTSS}
                      </span>
                      <span className="text-xs opacity-75">
                        ({Math.round((actualTSS / weekInfo.weekTSS) * 100)}%)
                      </span>
                    </div>
                  </div>
                )}

                {/* Week Days */}
                <div className="grid grid-cols-7 gap-2">
                  {weekDays.map((date, dayIndex) => {
                    const dateString = date.toDateString();
                    const dayWorkouts = workoutsByDate[dateString] || [];
                    const dayActivities = activitiesByDate[dateString] || [];
                    const isCurrentMonth = date.getMonth() === month;
                    const dayWeekInfo = getWeekInfo(date);

                    return (
                      <DroppableCalendarDay
                        key={dayIndex}
                        date={date}
                        isCurrentMonth={isCurrentMonth}
                        entries={dayWorkouts}
                        stravaActivities={dayActivities}
                        onClick={() => onDayClick?.(date, dayWorkouts)}
                        onDrop={handleDrop}
                        onWorkoutClick={onWorkoutClick}
                        phase={dayWeekInfo?.phase}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded border-2 border-primary"></div>
            <span>Today</span>
          </div>
          {trainingPlan && (
            <>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-blue-500"></div>
                <span>Base</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-orange-500"></div>
                <span>Build</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-500"></div>
                <span>Peak</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-500"></div>
                <span>Taper</span>
              </div>
            </>
          )}
        </div>
      </div>
  );
}
