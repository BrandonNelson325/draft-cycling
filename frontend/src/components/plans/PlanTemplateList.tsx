import { useState, useEffect } from 'react';
import { trainingPlanService } from '../../services/trainingPlanService';
import type { TrainingPlan } from '../../services/trainingPlanService';
import type { TrainingPlanTemplate } from '../../types/shared';
import { PlanTemplateCard } from './PlanTemplateCard';
import { useNavigate } from 'react-router-dom';

const DIFFICULTY_FILTERS = ['all', 'beginner', 'intermediate', 'advanced'] as const;

interface PlanTemplateListProps {
  activePlan: TrainingPlan | null;
}

export function PlanTemplateList({ activePlan }: PlanTemplateListProps) {
  const [templates, setTemplates] = useState<TrainingPlanTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await trainingPlanService.getTemplates();
      setTemplates(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? templates
    : templates.filter(t => t.difficulty_level === filter);

  const handleSelect = (template: TrainingPlanTemplate) => {
    navigate('/chat', {
      state: { initialMessage: `I'd like to start the ${template.name} training plan.` },
    });
  };

  return (
    <div>
      {/* Active plan banner */}
      {activePlan && (
        <button
          onClick={() => navigate('/training-plan')}
          className="w-full mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-left hover:bg-blue-100 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">Active Plan</p>
              <p className="text-sm text-blue-700">{activePlan.goal_event}</p>
            </div>
            <span className="text-xs text-blue-600">View details &rarr;</span>
          </div>
        </button>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 mb-4">
        {DIFFICULTY_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-2">Failed to load plan templates</p>
          <button onClick={loadTemplates} className="text-primary text-sm hover:underline">Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No plans match your filter</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(t => (
            <PlanTemplateCard key={t.id} template={t} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
