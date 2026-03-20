import { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DragDropCalendarGrid } from '../components/calendar/DragDropCalendarGrid';
import { CalendarDayDetail } from '../components/calendar/CalendarDayDetail';
import type { CalendarEntry, StravaActivity } from '../services/calendarService';
import { calendarService } from '../services/calendarService';
import { workoutService } from '../services/workoutService';
import { useNavigate } from 'react-router-dom';
import { trainingPlanService } from '../services/trainingPlanService';
import type { TrainingPlan } from '../services/trainingPlanService';
import { PlanOverview } from '../components/plan/PlanOverview';
import { WeekBreakdown } from '../components/plan/WeekBreakdown';
import { Button } from '../components/ui/button';

export function CalendarPage() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<CalendarEntry[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<StravaActivity[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

  useEffect(() => {
    trainingPlanService.getActivePlan()
      .then(setPlan)
      .catch(() => {})
      .finally(() => setPlanLoading(false));
  }, []);

  const handleDayClick = (date: Date, entries: CalendarEntry[], activities: StravaActivity[]) => {
    setSelectedDate(date);
    setSelectedEntries(entries);
    setSelectedActivities(activities);
  };

  const handleCompleteWorkout = async (entry: CalendarEntry) => {
    try {
      await calendarService.completeWorkout(entry.id);
      setRefreshTrigger(prev => prev + 1);
      alert('Workout marked as complete!');
    } catch (error) {
      console.error('Failed to complete workout:', error);
      alert('Failed to mark workout as complete');
    }
  };

  const handleDeleteEntry = async (entry: CalendarEntry) => {
    if (!confirm('Remove this workout from your calendar?')) return;

    try {
      await calendarService.deleteEntry(entry.id);
      setRefreshTrigger(prev => prev + 1);
      setSelectedDate(null);
    } catch (error) {
      console.error('Failed to delete entry:', error);
      alert('Failed to remove workout from calendar');
    }
  };

  const handleDownloadZWO = async (entry: CalendarEntry) => {
    if (!entry.workouts) return;

    try {
      await workoutService.downloadZWO(entry.workouts.id, entry.workouts.name);
    } catch (error) {
      console.error('Failed to download ZWO:', error);
      alert('Failed to download ZWO file');
    }
  };

  const handleDownloadFIT = async (entry: CalendarEntry) => {
    if (!entry.workouts) return;

    try {
      await workoutService.downloadFIT(entry.workouts.id, entry.workouts.name);
    } catch (error) {
      console.error('Failed to download FIT:', error);
      alert('Failed to download FIT file');
    }
  };

  const handleCancelPlan = async () => {
    if (!plan) return;
    if (!confirm('Are you sure you want to cancel this training plan? This will not delete your workouts from the calendar.')) return;
    try {
      await trainingPlanService.deletePlan(plan.id);
      setPlan(null);
    } catch (err) {
      console.error('Failed to cancel plan:', err);
      alert('Failed to cancel training plan');
    }
  };

  const handleClearCalendar = async () => {
    if (!confirm('Are you sure you want to clear your entire calendar? This will remove ALL scheduled workouts and cannot be undone.')) {
      return;
    }

    try {
      const result = await calendarService.clearCalendar();
      setRefreshTrigger(prev => prev + 1);
      alert(`Calendar cleared! Removed ${result.deletedCount} workout(s).`);
    } catch (error) {
      console.error('Failed to clear calendar:', error);
      alert('Failed to clear calendar');
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
    <div className="container mx-auto p-4 md:p-8 max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Training Calendar</h1>
          <p className="text-muted-foreground">
            Your scheduled workouts and rides. Browse plans to get started.
          </p>
        </div>
        <button
          onClick={handleClearCalendar}
          className="px-4 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
        >
          Clear Calendar
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* Calendar */}
        <div>
          <DragDropCalendarGrid
            onDayClick={handleDayClick}
            refreshTrigger={refreshTrigger}
          />
        </div>

        {/* Training Plan Sidebar */}
        <div className="lg:sticky lg:top-4 lg:self-start space-y-4">
          {planLoading ? (
            <div className="bg-card border rounded-lg p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
            </div>
          ) : plan ? (
            <div className="bg-card border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Training Plan</h2>
                <button
                  onClick={handleCancelPlan}
                  className="text-xs text-red-500 hover:text-red-600 transition-colors"
                >
                  Cancel Plan
                </button>
              </div>
              <PlanOverview plan={plan} />
              <WeekBreakdown weeks={plan.weeks} startDate={plan.start_date} />
            </div>
          ) : (
            <div className="bg-card border rounded-lg p-6 text-center">
              <h2 className="text-lg font-semibold mb-2">No Training Plan</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Choose a plan or have the AI coach build one for you.
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => navigate('/plans')} size="sm">
                  Browse Plans
                </Button>
                <Button onClick={() => navigate('/chat')} variant="outline" size="sm">
                  Ask AI Coach
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Day Detail Modal */}
      {selectedDate && (
        <CalendarDayDetail
          date={selectedDate}
          entries={selectedEntries}
          stravaActivities={selectedActivities}
          onClose={() => setSelectedDate(null)}
          onComplete={handleCompleteWorkout}
          onDelete={handleDeleteEntry}
          onDownloadZWO={handleDownloadZWO}
          onDownloadFIT={handleDownloadFIT}
        />
      )}
    </div>
    </DndProvider>
  );
}
