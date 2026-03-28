import type { Workout, WorkoutInterval } from '../types/workout';

/**
 * Generate a Wahoo .plan file from a workout definition.
 * Wahoo uses a text-based format with =HEADER= and =STREAM= sections.
 */
export function generateWahooPlan(workout: Workout, athleteFtp: number): string {
  const totalDuration = workout.intervals.reduce((sum, i) => {
    const reps = i.repeat || 1;
    return sum + i.duration * reps;
  }, 0);

  const lines: string[] = [
    '=HEADER=',
    `NAME=${workout.name}`,
    `DESCRIPTION=${(workout.description || '').replace(/\n/g, ' ')}`,
    `DURATION=${totalDuration}`,
    `FTP=${athleteFtp}`,
    'PLAN_TYPE=0',
    'WORKOUT_TYPE=0',
    '',
    '=STREAM=',
  ];

  for (const interval of workout.intervals) {
    if (interval.type === 'ramp') {
      const steps = rampToSteps(interval);
      for (const step of steps) {
        lines.push(...formatInterval(step));
      }
    } else {
      const reps = interval.repeat || 1;
      if (reps > 1) {
        lines.push(...formatInterval(interval, reps));
      } else {
        lines.push(...formatInterval(interval));
      }
    }
  }

  return lines.join('\n');
}

function formatInterval(interval: WorkoutInterval, repeat?: number): string[] {
  const name = intervalTypeName(interval.type);
  const power = interval.power || 50;

  const lines = [
    '=INTERVAL=',
    `INTERVAL_NAME=${name}`,
    `PERCENT_FTP_LO=${Math.max(0, power - 2)}`,
    `PERCENT_FTP_HI=${power + 2}`,
    `MESG_DURATION_SEC>${interval.duration}`,
  ];

  if (interval.cadence) {
    lines.push(`CAD_LO=${Math.max(0, interval.cadence - 5)}`);
    lines.push(`CAD_HI=${interval.cadence + 5}`);
  }

  if (repeat && repeat > 1) {
    lines.push(`REPEAT=${repeat}`);
  }

  lines.push('');
  return lines;
}

function rampToSteps(interval: WorkoutInterval): WorkoutInterval[] {
  const low = interval.power_low || 50;
  const high = interval.power_high || 100;
  const stepCount = 4;
  const stepDuration = Math.round(interval.duration / stepCount);
  const steps: WorkoutInterval[] = [];

  for (let i = 0; i < stepCount; i++) {
    const fraction = i / (stepCount - 1);
    const power = Math.round(low + (high - low) * fraction);
    steps.push({
      duration: stepDuration,
      power,
      type: interval.type === 'ramp' ? 'work' : interval.type,
    });
  }

  return steps;
}

function intervalTypeName(type: string): string {
  switch (type) {
    case 'warmup': return 'Warm Up';
    case 'cooldown': return 'Cool Down';
    case 'work': return 'Work';
    case 'rest': return 'Recovery';
    default: return 'Work';
  }
}
