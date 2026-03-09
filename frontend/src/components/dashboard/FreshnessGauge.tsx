interface FreshnessGaugeProps {
  tsb: number;
}

export function FreshnessGauge({ tsb }: FreshnessGaugeProps) {
  const getStatus = () => {
    if (tsb < -30) return { label: 'Overreaching', subtitle: 'Time for recovery', bgColor: 'bg-red-100 dark:bg-red-950', textColor: 'text-red-600 dark:text-red-400', color: '#ef4444' };
    if (tsb < -20) return { label: 'Optimal', subtitle: 'Recovery day coming up', bgColor: 'bg-violet-100 dark:bg-violet-950', textColor: 'text-violet-600 dark:text-violet-400', color: '#a78bfa' };
    if (tsb < -5) return { label: 'Optimal', subtitle: 'Right where you want to be', bgColor: 'bg-violet-100 dark:bg-violet-950', textColor: 'text-violet-600 dark:text-violet-400', color: '#a78bfa' };
    if (tsb < 5) return { label: 'Balanced', subtitle: 'Recovered and ready', bgColor: 'bg-emerald-100 dark:bg-emerald-950', textColor: 'text-emerald-600 dark:text-emerald-400', color: '#34d399' };
    if (tsb < 25) return { label: 'Fresh', subtitle: 'Ready for a big effort', bgColor: 'bg-blue-100 dark:bg-blue-950', textColor: 'text-blue-600 dark:text-blue-400', color: '#3b82f6' };
    return { label: 'Detrained', subtitle: 'Time to get back on the bike', bgColor: 'bg-gray-100 dark:bg-gray-900', textColor: 'text-gray-600 dark:text-gray-400', color: '#6b7280' };
  };

  const status = getStatus();

  // Map TSB from [-40, 40] to [0%, 100%]
  const pct = Math.max(0, Math.min(100, ((tsb + 40) / 80) * 100));

  return (
    <div className="space-y-3">
      {/* Gradient Gauge */}
      <div className="relative">
        <div className="h-3 bg-gradient-to-r from-red-400 via-yellow-400 via-green-400 to-blue-400 rounded-full" />
        <div
          className="absolute top-[-3px] w-1.5 h-[18px] bg-white rounded-sm shadow-md transition-all"
          style={{
            left: `${pct}%`,
            borderColor: status.color,
            borderWidth: 2,
            transform: 'translateX(-50%)',
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Tired</span>
        <span>Training</span>
        <span>Fresh</span>
      </div>

      {/* Status Badge */}
      <div className={`text-center p-3 rounded-xl ${status.bgColor}`}>
        <div className={`text-xl font-bold ${status.textColor}`}>
          {status.label}
        </div>
        <div className="text-xs font-medium text-muted-foreground mt-0.5">
          {status.subtitle}
        </div>
      </div>
    </div>
  );
}
