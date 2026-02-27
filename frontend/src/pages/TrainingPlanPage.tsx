import { useEffect, useState } from 'react';
import { trainingPlanService } from '../services/trainingPlanService';
import type { TrainingPlan } from '../services/trainingPlanService';
import { PlanOverview } from '../components/plan/PlanOverview';
import { WeekBreakdown } from '../components/plan/WeekBreakdown';
import { Button } from '../components/ui/button';
import { useNavigate } from 'react-router-dom';

export function TrainingPlanPage() {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadPlan();
  }, []);

  const loadPlan = async () => {
    try {
      setLoading(true);
      const activePlan = await trainingPlanService.getActivePlan();
      setPlan(activePlan);
    } catch (err) {
      setError('Failed to load training plan');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!plan) return;

    if (!confirm('Are you sure you want to cancel this training plan? This will not delete your workouts from the calendar.')) {
      return;
    }

    try {
      await trainingPlanService.deletePlan(plan.id);
      setPlan(null);
    } catch (err) {
      console.error('Failed to delete plan:', err);
      alert('Failed to cancel training plan');
    }
  };

  const handleCreateNewPlan = () => {
    navigate('/chat', {
      state: {
        initialMessage: 'I want to create a new training plan',
      },
    });
  };

  const handleBrowsePlans = () => {
    navigate('/chat', {
      state: {
        initialMessage: 'Show me your pre-built training plans',
      },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading training plan...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <Button onClick={loadPlan} variant="outline" className="mt-4">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center py-12">
          <h1 className="text-3xl font-bold mb-4">Training Plan</h1>
          <p className="text-muted-foreground mb-8">
            Choose a pre-built plan or have the AI coach build one custom for you.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={handleBrowsePlans}>
              Browse Plans
            </Button>
            <Button onClick={handleCreateNewPlan} variant="outline">
              Custom Plan with AI
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Training Plan</h1>
        <Button onClick={handleDeletePlan} variant="outline" className="text-red-600">
          Cancel Plan
        </Button>
      </div>

      <PlanOverview plan={plan} />

      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Week-by-Week Breakdown</h2>
        <WeekBreakdown weeks={plan.weeks} startDate={plan.start_date} />
      </div>
    </div>
  );
}
