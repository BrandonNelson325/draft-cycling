interface FreshnessGaugeProps {
  tsb: number;
}

export function FreshnessGauge({ tsb }: FreshnessGaugeProps) {
  // TSB interpretation (aligned with industry standards):
  // < -30: Overreaching
  // -30 to -20: Hard training block
  // -20 to -5: Optimal training zone (where fitness is built!)
  // -5 to 5: Balanced
  // 5 to 25: Fresh/race ready
  // > 25: Detraining risk

  const getStatus = () => {
    if (tsb < -30) return { label: 'Overreaching', color: '#ef4444', bgColor: 'bg-red-100 dark:bg-red-950', textColor: 'text-red-600 dark:text-red-400' };
    if (tsb < -20) return { label: 'Hard Training', color: '#f97316', bgColor: 'bg-orange-100 dark:bg-orange-950', textColor: 'text-orange-600 dark:text-orange-400' };
    if (tsb < -5) return { label: 'Optimal', color: '#22c55e', bgColor: 'bg-green-100 dark:bg-green-950', textColor: 'text-green-600 dark:text-green-400' };
    if (tsb < 5) return { label: 'Balanced', color: '#22c55e', bgColor: 'bg-green-100 dark:bg-green-950', textColor: 'text-green-600 dark:text-green-400' };
    if (tsb < 25) return { label: 'Fresh', color: '#3b82f6', bgColor: 'bg-blue-100 dark:bg-blue-950', textColor: 'text-blue-600 dark:text-blue-400' };
    return { label: 'Detraining', color: '#6b7280', bgColor: 'bg-gray-100 dark:bg-gray-900', textColor: 'text-gray-600 dark:text-gray-400' };
  };

  const status = getStatus();

  // Map TSB to percentage on the gauge
  const getPercentage = () => {
    if (tsb < -30) return 5;
    if (tsb < -20) return 20;
    if (tsb < -5) return 40;
    if (tsb < 5) return 55;
    if (tsb < 25) return 75;
    return 95;
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
        <span>Overreaching</span>
        <span>Training</span>
        <span>Optimal</span>
        <span>Fresh</span>
      </div>

      {/* Value and Status */}
      <div className={`text-center p-3 rounded-xl ${status.bgColor}`}>
        <div className={`text-xl font-bold ${status.textColor}`}>
          {status.label}
        </div>
        <div className="text-xs font-medium text-muted-foreground mt-0.5">
          Freshness: {tsb > 0 ? '+' : ''}{tsb.toFixed(0)}
        </div>
      </div>
    </div>
  );
}
