import { useState } from 'react';
import { WorkoutLibrary } from '../components/workout/WorkoutLibrary';
import { WorkoutDetail } from '../components/workout/WorkoutDetail';
import type { Workout } from '../services/workoutService';
import { workoutService } from '../services/workoutService';
import { useNavigate } from 'react-router-dom';

export function WorkoutsPage() {
  const navigate = useNavigate();
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null);

  const handleViewWorkout = (workout: Workout) => {
    setSelectedWorkout(workout);
  };

  const handleScheduleWorkout = async () => {
    // For now, just navigate to calendar
    // TODO: Could show a date picker modal here
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
    // Navigate to chat and suggest asking AI
    navigate('/chat');
    alert('Ask the AI coach to create a workout for you! For example: "Create a 4x8 minute VO2max workout"');
  };

  return (
    <div className="container mx-auto p-4 md:p-8">
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
    </div>
  );
}
