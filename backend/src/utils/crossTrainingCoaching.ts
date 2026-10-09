/**
 * Cross-training for the COACH: a compact list + rules. Pure, testable.
 */
import { CATEGORY_PROFILES, ActivityCategory } from './activityLoad';

export interface CrossTrainingRow {
  name?: string | null; sport_type: string; category: string; start_date: string;
  moving_time_seconds?: number | null; distance_meters?: number | null; average_heartrate?: number | null;
  est_tss?: number | null; fatigue_load?: number | null; load_method?: string | null;
}

const profile = (c: string) => CATEGORY_PROFILES[(c as ActivityCategory)] || CATEGORY_PROFILES.other;

export function describeCrossTraining(a: CrossTrainingRow, localDate: (iso: string) => string, unit: 'metric' | 'imperial' = 'metric'): string {
  const p = profile(a.category);
  const min = a.moving_time_seconds ? Math.round(a.moving_time_seconds / 60) : null;
  const dist = a.distance_meters && a.distance_meters > 200
    ? (unit === 'imperial' ? `${(a.distance_meters / 1609.34).toFixed(1)}mi` : `${(a.distance_meters / 1000).toFixed(1)}km`) : null;
  const bits = [min ? `${min}min` : null, dist, a.average_heartrate ? `avg HR ${Math.round(Number(a.average_heartrate))}` : null].filter(Boolean).join(', ');
  const load = a.fatigue_load != null
    ? `fatigue load ~${Math.round(Number(a.fatigue_load))}${a.load_method === 'duration' ? ' (no HR — estimated from duration)' : ''}`
    : '';
  return `${localDate(a.start_date)} ${p.label}${a.name ? ` "${a.name}"` : ''}: ${bits}${load ? `; ${load}` : ''} — ${p.note}`;
}

export const CROSS_TRAINING_RULES = `**OTHER TRAINING (non-cycling) — it's real load:**
Runs, gym, soccer, hikes, swims etc. are pulled from Strava and rated for their effect on CYCLING: a "fatigue load" (heart-rate based when HR exists, weighted for how hard the sport hits cycling legs) that feeds ATL/TSB, and a smaller fitness credit for aerobic crossover. Use them:
- A run, trail run, team sport or leg-day lift leaves legs heavier than HR suggests (impact/eccentric load, DOMS peaking 24–48h) — think twice before a hard ride the next day; suggest moving or trimming it.
- Swims, paddling, climbing, yoga, walks are light on cycling legs — usually no change needed.
- Count non-cycling load when judging recent volume, but never call it cycling fitness (no power data; FTP/zones unaffected).
- If the athlete mentions an activity that isn't listed, ask or take their word for it.
- Never scold the athlete for doing other sports — plan around them.`;
