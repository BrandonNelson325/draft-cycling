import type { TrainingPlanTemplate } from '../../types/shared';

const DIFFICULTY_COLORS = {
  beginner: { bg: 'bg-green-100', text: 'text-green-700' },
  intermediate: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  advanced: { bg: 'bg-red-100', text: 'text-red-700' },
};

interface PlanTemplateCardProps {
  template: TrainingPlanTemplate;
  onSelect: (template: TrainingPlanTemplate) => void;
}

export function PlanTemplateCard({ template, onSelect }: PlanTemplateCardProps) {
  const colors = DIFFICULTY_COLORS[template.difficulty_level];

  return (
    <button
      onClick={() => onSelect(template)}
      className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/50 hover:shadow-md transition-all w-full"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-foreground text-base">{template.name}</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} shrink-0`}>
          {template.difficulty_level}
        </span>
      </div>

      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{template.description}</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{template.duration_weeks} weeks</span>
        <span>{template.days_per_week} days/wk</span>
        <span>{template.hours_per_week_min}–{template.hours_per_week_max} hrs/wk</span>
      </div>

      {template.target_event && (
        <div className="mt-2">
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
            {template.target_event}
          </span>
        </div>
      )}
    </button>
  );
}
