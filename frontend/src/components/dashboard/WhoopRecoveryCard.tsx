import { useEffect, useState } from 'react';
import { Card, CardContent } from '../ui/card';
import { dailyCheckInService, type WellnessData } from '../../services/dailyCheckInService';

const recoveryColor = (r: number) => (r >= 67 ? 'text-green-600' : r >= 34 ? 'text-yellow-500' : 'text-red-600');
const recoveryBorder = (r: number) => (r >= 67 ? 'border-green-600' : r >= 34 ? 'border-yellow-500' : 'border-red-600');
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;

/**
 * Today's WHOOP recovery, sleep and strain — a compact, visually separate
 * section inside the Coach card. Renders nothing for athletes without WHOOP.
 */
export function WhoopRecoveryCard() {
  const [w, setW] = useState<Partial<WellnessData> | null>(null);
  const [stale, setStale] = useState<string | null>(null); // latest scored day when today isn't in yet

  useEffect(() => {
    dailyCheckInService.getDailyReadiness()
      .then((r) => {
        if (r?.wellness?.source === 'whoop') { setW(r.wellness); setStale(null); return; }
        // Whoop connected but today not scored yet → show the latest day, labeled.
        const latest = r?.whoop?.latest;
        if (r?.whoop?.connected && latest) {
          setW({ readinessScore: latest.readinessScore, hrv: latest.hrv, rhr: latest.rhr, sleepSeconds: latest.sleepSeconds, sleepNeedSeconds: latest.sleepNeedSeconds, dayStrain: latest.dayStrain });
          setStale(latest.date);
        } else setW(null);
      })
      .catch(() => setW(null));
  }, []);

  if (!w || w.readinessScore == null) return null;

  const stats = [
    w.hrv != null ? `HRV ${w.hrv}ms` : null,
    w.rhr != null ? `RHR ${w.rhr}` : null,
    w.sleepSeconds != null ? `Sleep ${hm(w.sleepSeconds)}${w.sleepNeedSeconds ? ` / ${hm(w.sleepNeedSeconds)}` : ''}` : null,
    w.dayStrain != null ? `Strain ${w.dayStrain.toFixed(1)}` : null,
  ].filter(Boolean).join(' · ');
  const note = stale
    ? `${new Date(stale + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })} · today not scored yet`
    : w.recoveryCalibrating ? 'calibrating' : null;

  return (
    <Card>
      <CardContent className="py-3 px-4 flex items-center gap-4">
        <div className={`rounded-full border-2 px-3 py-0.5 text-lg font-extrabold ${recoveryColor(w.readinessScore)} ${recoveryBorder(w.readinessScore)}`}>
          {w.readinessScore}%
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Recovery</span>
            <span className="text-[10px] font-bold tracking-wider text-gray-400">WHOOP{note ? ` · ${note}` : ''}</span>
          </div>
          <div className="text-xs text-gray-500 truncate">{stats}</div>
        </div>
      </CardContent>
    </Card>
  );
}
