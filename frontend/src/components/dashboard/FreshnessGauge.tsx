interface FreshnessGaugeProps {
  tsb: number;
}

export function FreshnessGauge({ tsb }: FreshnessGaugeProps) {
  // TSB interpretation:
  // < -30: Overtrained
  // -30 to -10: High fatigue
  // -10 to 5: Optimal training
  // 5 to 25: Fresh/race ready
  // > 25: Detraining

  const getStatus = () => {
    if (tsb < -30) return { label: 'Overtrained', color: '#ef4444', bgColor: 'bg-red-100', textColor: 'text-red-600' };
    if (tsb < -10) return { label: 'Fatigued', color: '#f97316', bgColor: 'bg-orange-100', textColor: 'text-orange-600' };
    if (tsb < 5) return { label: 'Optimal', color: '#22c55e', bgColor: 'bg-green-100', textColor: 'text-green-600' };
    if (tsb < 25) return { label: 'Fresh', color: '#3b82f6', bgColor: 'bg-blue-100', textColor: 'text-blue-600' };
    return { label: 'Detraining', color: '#6b7280', bgColor: 'bg-gray-100', textColor: 'text-gray-600' };
  };

  const status = getStatus();

  // Map TSB to percentage (simplified)
  const getPercentage = () => {
    if (tsb < -30) return 0;
    if (tsb < -10) return 25;
    if (tsb < 5) return 50;
    if (tsb < 25) return 75;
    return 100;
  };

  const percentage = getPercentage();

  return (
    <div className="space-y-3">
      {/* Simple Progress Bar Gauge */}
      <div className="relative">
        <div className="h-2.5 bg-gradient-to-r from-red-400 via-green-400 to-blue-400 rounded-full" />
        {/* Indicator */}
        <div
          className="absolute top-0 w-1 h-2.5 bg-white border-2 transition-all"
          style={{
            left: `${percentage}%`,
            borderColor: status.color,
            transform: 'translateX(-50%)',
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Overtrained</span>
        <span>Fatigued</span>
        <span>Optimal</span>
        <span>Fresh</span>
      </div>

      {/* Value and Status */}
      <div className={`text-center p-3 rounded-xl ${status.bgColor}`}>
        <div className={`text-3xl font-bold ${status.textColor}`}>
          {tsb.toFixed(1)}
        </div>
        <div className="text-xs font-medium text-muted-foreground mt-0.5">
          {status.label}
        </div>
      </div>
    </div>
  );
}
