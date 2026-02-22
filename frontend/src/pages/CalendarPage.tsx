import { useState } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DragDropCalendarGrid } from '../components/calendar/DragDropCalendarGrid';
import { WorkoutPickerSidebar } from '../components/calendar/WorkoutPickerSidebar';
import { CalendarDayDetail } from '../components/calendar/CalendarDayDetail';
import { WorkoutDetail } from '../components/workout/WorkoutDetail';
import type { CalendarEntry } from '../services/calendarService';
import { calendarService } from '../services/calendarService';
import type { Workout } from '../services/workoutService';
import { workoutService } from '../services/workoutService';
import { useNavigate } from 'react-router-dom';

export function CalendarPage() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<CalendarEntry[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleDayClick = (date: Date, entries: CalendarEntry[]) => {
    setSelectedDate(date);
    setSelectedEntries(entries);
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

  const handleCreateWorkout = () => {
    navigate('/chat');
  };

  const handleViewWorkoutFromLibrary = (workout: Workout) => {
    setSelectedWorkout(workout);
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
              Drag workouts from the library to schedule them, or ask the AI coach to create a training plan
            </p>
          </div>
          <button
            onClick={handleClearCalendar}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
          >
            Clear Calendar
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          {/* Calendar */}
          <div>
            <DragDropCalendarGrid
              onDayClick={handleDayClick}
              refreshTrigger={refreshTrigger}
            />
          </div>

          {/* Workout Picker Sidebar */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="bg-card border rounded-lg p-4">
              <WorkoutPickerSidebar
                onCreateWorkout={handleCreateWorkout}
                onViewWorkout={handleViewWorkoutFromLibrary}
              />
            </div>
          </div>
        </div>

      {/* Day Detail Modal */}
      {selectedDate && (
        <CalendarDayDetail
          date={selectedDate}
          entries={selectedEntries}
          onClose={() => setSelectedDate(null)}
          onComplete={handleCompleteWorkout}
          onDelete={handleDeleteEntry}
          onDownloadZWO={handleDownloadZWO}
          onDownloadFIT={handleDownloadFIT}
        />
      )}

      {/* Workout Detail Modal */}
      {selectedWorkout && (
        <WorkoutDetail
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onSchedule={async () => {
            setSelectedWorkout(null);
            alert('Drag the workout to a day on the calendar to schedule it!');
          }}
        />
      )}
      </div>
    </DndProvider>
  );
}
