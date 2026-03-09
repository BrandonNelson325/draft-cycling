interface FreshnessGaugeProps {
  tsb: number;
}

export function FreshnessGauge({ tsb }: FreshnessGaugeProps) {
  const getStatus = () => {
    if (tsb < -30) return { label: 'Overreaching', subtitle: 'Time for recovery', bgColor: 'bg-red-100 dark:bg-red-950', textColor: 'text-red-600 dark:text-red-400' };
    if (tsb < -20) return { label: 'Building Fitness', subtitle: 'Plan a recovery day soon', bgColor: 'bg-amber-100 dark:bg-amber-950', textColor: 'text-amber-600 dark:text-amber-400' };
    if (tsb < -5) return { label: 'Building Fitness', subtitle: 'Right where you want to be', bgColor: 'bg-green-100 dark:bg-green-950', textColor: 'text-green-600 dark:text-green-400' };
    if (tsb < 5) return { label: 'Balanced', subtitle: 'Recovered and ready', bgColor: 'bg-green-100 dark:bg-green-950', textColor: 'text-green-600 dark:text-green-400' };
    if (tsb < 25) return { label: 'Fresh', subtitle: 'Ready for a big effort', bgColor: 'bg-blue-100 dark:bg-blue-950', textColor: 'text-blue-600 dark:text-blue-400' };
    return { label: 'Losing Fitness', subtitle: 'Time to get back on the bike', bgColor: 'bg-gray-100 dark:bg-gray-900', textColor: 'text-gray-600 dark:text-gray-400' };
  };

  const status = getStatus();

  return (
    <div className={`text-center p-4 rounded-xl ${status.bgColor}`}>
      <div className={`text-xl font-bold ${status.textColor}`}>
        {status.label}
      </div>
      <div className="text-xs font-medium text-muted-foreground mt-1">
        {status.subtitle}
      </div>
    </div>
  );
}
