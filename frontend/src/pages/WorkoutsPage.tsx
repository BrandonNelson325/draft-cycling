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
