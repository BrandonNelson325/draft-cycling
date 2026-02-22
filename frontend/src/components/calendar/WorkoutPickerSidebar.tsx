import { useState, useEffect } from 'react';
import { Search, Plus } from 'lucide-react';
import type { Workout, WorkoutType } from '../../services/workoutService';
import { workoutService } from '../../services/workoutService';
import { DraggableWorkoutItem } from './DraggableWorkoutItem';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface WorkoutPickerSidebarProps {
  onCreateWorkout?: () => void;
  onViewWorkout?: (workout: Workout) => void;
}

const workoutTypes: { value: WorkoutType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'endurance', label: 'Endurance' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'threshold', label: 'Threshold' },
  { value: 'vo2max', label: 'VO2max' },
  { value: 'sprint', label: 'Sprint' },
  { value: 'recovery', label: 'Recovery' },
];

export function WorkoutPickerSidebar({
  onCreateWorkout,
  onViewWorkout,
}: WorkoutPickerSidebarProps) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [filteredWorkouts, setFilteredWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<WorkoutType | 'all'>('all');

  useEffect(() => {
    loadWorkouts();
  }, []);

  useEffect(() => {
    filterWorkouts();
  }, [workouts, searchTerm, selectedType]);

  const loadWorkouts = async () => {
    try {
      setLoading(true);
      const data = await workoutService.getWorkouts();
      setWorkouts(data);
    } catch (err) {
      console.error('Failed to load workouts:', err);
    } finally {
      setLoading(false);
    }
  };

  const filterWorkouts = () => {
    let filtered = workouts;

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((w) => w.workout_type === selectedType);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.name.toLowerCase().includes(term) ||
          w.description?.toLowerCase().includes(term)
      );
    }

    setFilteredWorkouts(filtered);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Workout Library</h3>
        {onCreateWorkout && (
          <Button size="sm" onClick={onCreateWorkout}>
            <Plus className="w-4 h-4 mr-1" />
            New
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search workouts..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-1">
        {workoutTypes.map((type) => (
          <Button
            key={type.value}
            variant={selectedType === type.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedType(type.value)}
            className="text-xs"
          >
            {type.label}
          </Button>
        ))}
      </div>

      {/* Workout list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {filteredWorkouts.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">
                {searchTerm || selectedType !== 'all'
                  ? 'No workouts found'
                  : 'No workouts yet. Ask the AI coach to create one!'}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredWorkouts.map((workout) => (
            <DraggableWorkoutItem
              key={workout.id}
              workout={workout}
              onClick={() => onViewWorkout?.(workout)}
            />
          ))
        )}
      </div>

      {/* Help text */}
      <div className="bg-muted/50 p-3 rounded-lg text-xs text-muted-foreground">
        <p className="font-medium mb-1">💡 Tip:</p>
        <p>Drag workouts to calendar days to schedule them</p>
      </div>
    </div>
  );
}
