import { useState, useEffect } from 'react';
import { Plus, Filter } from 'lucide-react';
import type {
  Workout,
  WorkoutType,
  WorkoutFilters,
} from '../../services/workoutService';
import { workoutService } from '../../services/workoutService';
import { WorkoutCard } from './WorkoutCard';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmptyState } from '../ui/EmptyState';

interface WorkoutLibraryProps {
  onViewWorkout?: (workout: Workout) => void;
  onScheduleWorkout?: (workout: Workout) => void;
  onCreateWorkout?: () => void;
}

const workoutTypes: { value: WorkoutType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'vo2max', label: 'VO2max' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'custom', label: 'Custom' },
];

export function WorkoutLibrary({
  onViewWorkout,
  onScheduleWorkout,
  onCreateWorkout,
}: WorkoutLibraryProps) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<WorkoutFilters>({});
  const [selectedType, setSelectedType] = useState<WorkoutType | 'all'>('all');
  const [showAiOnly, setShowAiOnly] = useState(false);

  useEffect(() => {
    loadWorkouts();
  }, [filters]);

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await workoutService.getWorkouts(filters);
      setWorkouts(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load workouts');
    } finally {
      setLoading(false);
    }
  };

  const handleTypeChange = (type: WorkoutType | 'all') => {
    setSelectedType(type);
    setFilters({
      ...filters,
      type: type === 'all' ? undefined : type,
    });
  };

  const handleAiFilterToggle = () => {
    const newValue = !showAiOnly;
    setShowAiOnly(newValue);
    setFilters({
      ...filters,
      ai_generated: newValue ? true : undefined,
    });
  };

  const handleDelete = async (workout: Workout) => {
    if (!confirm(`Are you sure you want to delete "${workout.name}"?`)) {
      return;
    }

    try {
      await workoutService.deleteWorkout(workout.id);
      await loadWorkouts();
    } catch (err: any) {
      alert(err.message || 'Failed to delete workout');
    }
  };

  const handleDownloadZWO = async (workout: Workout) => {
    try {
      await workoutService.downloadZWO(workout.id, workout.name);
    } catch (err: any) {
      alert(err.message || 'Failed to download ZWO file');
    }
  };

  const handleDownloadFIT = async (workout: Workout) => {
    try {
      await workoutService.downloadFIT(workout.id, workout.name);
    } catch (err: any) {
      alert(err.message || 'Failed to download FIT file');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Workout Library</h2>
          <p className="text-muted-foreground">
            Browse and manage your workouts
          </p>
        </div>
        {onCreateWorkout && (
          <Button onClick={onCreateWorkout}>
            <Plus className="w-4 h-4 mr-2" />
            Create Workout
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {workoutTypes.map((type) => (
              <Button
                key={type.value}
                variant={selectedType === type.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleTypeChange(type.value)}
              >
                {type.label}
              </Button>
            ))}
            <div className="ml-auto">
              <Button
                variant={showAiOnly ? 'default' : 'outline'}
                size="sm"
                onClick={handleAiFilterToggle}
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                AI Generated Only
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive text-center">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && workouts.length === 0 && (
        <EmptyState
          title="No workouts found"
          description={
            filters.type || filters.ai_generated
              ? 'Try adjusting your filters'
              : 'Create your first workout to get started'
          }
          action={
            onCreateWorkout
              ? {
                  label: 'Create Workout',
                  onClick: onCreateWorkout,
                }
              : undefined
          }
        />
      )}

      {/* Workout Grid */}
      {!loading && !error && workouts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workouts.map((workout) => (
            <WorkoutCard
              key={workout.id}
              workout={workout}
              onView={onViewWorkout}
              onSchedule={onScheduleWorkout}
              onDelete={handleDelete}
              onDownloadZWO={handleDownloadZWO}
              onDownloadFIT={handleDownloadFIT}
            />
          ))}
        </div>
      )}

      {/* Results Count */}
      {!loading && !error && workouts.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {workouts.length} workout{workouts.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
