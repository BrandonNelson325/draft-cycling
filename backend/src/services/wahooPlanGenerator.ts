import type { Workout, WorkoutInterval } from '../types/workout';

/**
 * Generate a Wahoo plan.json file (Cloud API "Public plan.json File Format",
 * version 1.0.0 — cloud-api.wahooligan.com/docs/plan-json-format.pdf).
 *
 * Oct 27 2026: this used to emit the legacy text format (=HEADER= / =STREAM=),
 * which the Cloud API rejects ("Could not serialize plan for validation") — no
 * Draft workout had ever reached a Wahoo device. The API only takes JSON.
 *
 * Targets are FRACTIONS of FTP (1 = 100%), with FTP in the header, so the head
 * unit resolves watts itself.
 */
export function generateWahooPlan(workout: Workout, athleteFtp: number): string {
  const intervals: WahooInterval[] = [];

  for (const interval of workout.intervals) {
    if (interval.type === 'ramp') {
      // plan.json has no ramp target — step it.
      for (const step of rampToSteps(interval)) intervals.push(toWahooInterval(step));
    } else {
      const step = toWahooInterval(interval);
      const reps = interval.repeat || 1;
      // exit_trigger "repeat" counts repeats AFTER the first pass.
      intervals.push(
        reps > 1
          ? { name: step.name, exit_trigger_type: 'repeat', exit_trigger_value: reps - 1, intervals: [step] }
          : step
      );
    }
  }

  const plan = {
    header: {
      name: workout.name,
      version: '1.0.0',
      description: (workout.description || '').slice(0, 5000),
      workout_type_family: 0, // biking
      workout_type_location: 0, // indoor — structured sessions; harmless outdoors
      ftp: Math.round(athleteFtp),
    },
    intervals,
  };

  return JSON.stringify(plan);
}

interface WahooInterval {
  name: string;
  exit_trigger_type: 'time' | 'repeat';
  exit_trigger_value: number;
  intensity_type?: string;
  targets?: { type: 'ftp' | 'rpm'; low: number; high: number }[];
  intervals?: WahooInterval[];
}

function toWahooInterval(interval: WorkoutInterval): WahooInterval {
  const power = interval.power || 50;
  // Max efforts (sprints, FTP test): wide band with the target as the floor so
  // a trainer in ERG doesn't pin the rider at it.
  const lowPct = interval.open ? Math.max(0, power - 5) : Math.max(0, power - 2);
  const highPct = interval.open ? power + 100 : power + 2;

  const targets: WahooInterval['targets'] = [
    { type: 'ftp', low: round2(lowPct / 100), high: round2(highPct / 100) },
  ];
  if (interval.cadence) {
    targets.push({ type: 'rpm', low: Math.max(0, interval.cadence - 5), high: interval.cadence + 5 });
  }

  return {
    name: intervalTypeName(interval.type),
    exit_trigger_type: 'time',
    exit_trigger_value: Math.max(1, Math.round(interval.duration)),
    intensity_type: intensityType(interval),
    targets,
  };
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

function intensityType(interval: WorkoutInterval): string {
  switch (interval.type) {
    case 'warmup': return 'wu';
    case 'cooldown': return 'cd';
    case 'rest': return 'recover';
  }
  const p = interval.power || 0;
  if (interval.open) return p >= 130 ? 'nm' : 'ftp';
  if (p >= 150) return 'nm';
  if (p >= 120) return 'ac';
  if (p >= 106) return 'map';
  if (p >= 95) return 'ftp';
  if (p >= 88) return 'lt';
  if (p >= 76) return 'tempo';
  return 'active';
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
