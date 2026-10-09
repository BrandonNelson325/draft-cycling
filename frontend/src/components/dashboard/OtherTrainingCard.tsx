import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { crossTrainingService, type CrossTrainingActivity } from '../../services/crossTrainingService';
import { useAuthStore } from '../../stores/useAuthStore';

const ICON: Record<string, string> = {
  run: '🏃', trail_run: '🏃', walk: '🚶', hike: '🥾', swim: '🏊', row: '🚣', paddle: '🛶',
  nordic_ski: '⛷️', alpine_ski: '⛷️', strength: '🏋️', mobility: '🧘', team_sport: '⚽',
  racket: '🎾', climb: '🧗', skate: '⛸️', other: '💪',
};

/** Non-cycling training (from Strava) + its effect on cycling. Hidden when empty. */
export function OtherTrainingCard() {
  const user = useAuthStore((s) => s.user);
  const imperial = user?.unit_system === 'imperial';
  const [items, setItems] = useState<CrossTrainingActivity[]>([]);
  const [weekLoad, setWeekLoad] = useState(0);

  useEffect(() => {
    crossTrainingService.list(14)
      .then((r) => { setItems(r.activities || []); setWeekLoad(r.last7_fatigue_load || 0); })
      .catch(() => setItems([]));
  }, []);

  if (!items.length) return null;
  const dist = (m: number | null) =>
    m && m > 200 ? (imperial ? `${(m / 1609.34).toFixed(1)} mi` : `${(m / 1000).toFixed(1)} km`) : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Other training</CardTitle>
          <span className="text-xs text-gray-500">7-day fatigue load: <strong className="text-gray-900">{weekLoad}</strong></span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0">
            <div className="text-xl">{ICON[a.category] || ICON.other}</div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate">{a.label}{a.name ? ` · ${a.name}` : ''}</div>
              <div className="text-xs text-gray-500">
                {new Date(a.start_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {a.duration_min ? ` · ${a.duration_min} min` : ''}
                {dist(a.distance_meters) ? ` · ${dist(a.distance_meters)}` : ''}
                {a.avg_hr ? ` · ${a.avg_hr} bpm` : ''}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{a.effect}</div>
            </div>
            {a.fatigue_load != null && (
              <div className="text-center">
                <div className="text-lg font-extrabold text-orange-500">{a.fatigue_load}</div>
                <div className="text-[10px] text-gray-400">load</div>
              </div>
            )}
          </div>
        ))}
        <p className="text-xs text-gray-400">Counts toward your fatigue and form; your coach plans around it.</p>
      </CardContent>
    </Card>
  );
}
