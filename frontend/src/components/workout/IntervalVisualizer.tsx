import type { WorkoutInterval } from '../../services/workoutService';
import { cn } from '../../lib/utils';

interface IntervalVisualizerProps {
  intervals: WorkoutInterval[];
}

interface PowerZone {
  zone: number;
  color: string;
  label: string;
}

const getPowerZone = (powerPercent: number): PowerZone => {
  if (powerPercent < 55) {
    return { zone: 1, color: 'bg-gray-400', label: 'Z1 Recovery' };
  } else if (powerPercent < 75) {
    return { zone: 2, color: 'bg-blue-400', label: 'Z2 Endurance' };
  } else if (powerPercent < 90) {
    return { zone: 3, color: 'bg-green-400', label: 'Z3 Tempo' };
  } else if (powerPercent < 105) {
    return { zone: 4, color: 'bg-yellow-400', label: 'Z4 Threshold' };
  } else if (powerPercent < 120) {
    return { zone: 5, color: 'bg-orange-400', label: 'Z5 VO2max' };
  } else {
    return { zone: 6, color: 'bg-red-400', label: 'Z6 Anaerobic' };
  }
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}:${secs.toString().padStart(2, '0')}` : `${minutes}m`;
};

export function IntervalVisualizer({ intervals }: IntervalVisualizerProps) {
  // Calculate total duration for proportional sizing
  const totalDuration = intervals.reduce((sum, interval) => {
    const repeat = interval.repeat || 1;
    return sum + interval.duration * repeat;
  }, 0);

  // Expand repeated intervals for visualization
  const expandedIntervals: WorkoutInterval[] = [];
  intervals.forEach((interval) => {
    const repeat = interval.repeat || 1;
    for (let i = 0; i < repeat; i++) {
      expandedIntervals.push({ ...interval, repeat: 1 });
    }
  });

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="relative h-32 bg-muted/30 rounded-lg overflow-hidden">
        <div className="absolute inset-0 flex">
          {expandedIntervals.map((interval, index) => {
            const widthPercent = (interval.duration / totalDuration) * 100;

            // Get power for display (handle ramps)
            let displayPower: number;
            let heightPercent: number;

            if (interval.type === 'ramp' && interval.power_low !== undefined && interval.power_high !== undefined) {
              displayPower = (interval.power_low + interval.power_high) / 2;
            } else {
              displayPower = interval.power || 50;
            }

            // Cap height at 150% FTP for better visualization
            const cappedPower = Math.min(displayPower, 150);
            heightPercent = (cappedPower / 150) * 100;

            const zone = getPowerZone(displayPower);

            return (
              <div
                key={index}
                className="relative flex items-end group"
                style={{ width: `${widthPercent}%` }}
              >
                <div
                  className={cn(
                    'w-full transition-all',
                    zone.color,
                    'hover:opacity-80 cursor-pointer'
                  )}
                  style={{ height: `${heightPercent}%` }}
                >
                  {/* Tooltip on hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded px-2 py-1 shadow-lg whitespace-nowrap z-10">
                    <div className="font-medium capitalize">{interval.type}</div>
                    <div>{formatDuration(interval.duration)}</div>
                    {interval.type === 'ramp' ? (
                      <div>{interval.power_low}% → {interval.power_high}% FTP</div>
                    ) : (
                      <div>{displayPower}% FTP</div>
                    )}
                    <div className="text-muted-foreground">{zone.label}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-gray-400" />
          <span>Z1 Recovery</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-400" />
          <span>Z2 Endurance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-400" />
          <span>Z3 Tempo</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-400" />
          <span>Z4 Threshold</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-400" />
          <span>Z5 VO2max</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-400" />
          <span>Z6 Anaerobic</span>
        </div>
      </div>

      {/* Interval List */}
      <div className="space-y-2">
        {intervals.map((interval, index) => {
          const repeat = interval.repeat || 1;
          let powerDisplay: string;

          if (interval.type === 'ramp' && interval.power_low !== undefined && interval.power_high !== undefined) {
            powerDisplay = `${interval.power_low}% → ${interval.power_high}% FTP`;
          } else {
            powerDisplay = `${interval.power || 50}% FTP`;
          }

          return (
            <div
              key={index}
              className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono text-muted-foreground">{index + 1}</span>
                <span className="font-medium capitalize">{interval.type}</span>
                <span className="text-muted-foreground">{formatDuration(interval.duration)}</span>
                <span className="text-muted-foreground">{powerDisplay}</span>
                {repeat > 1 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    ×{repeat}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
