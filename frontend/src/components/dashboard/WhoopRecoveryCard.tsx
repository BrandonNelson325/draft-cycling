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

  const stats: [string, string][] = [];
  if (w.hrv != null) stats.push(['HRV', `${w.hrv} ms`]);
  if (w.rhr != null) stats.push(['Resting HR', `${w.rhr} bpm`]);
  if (w.sleepSeconds != null) stats.push(['Sleep', `${hm(w.sleepSeconds)}${w.sleepNeedSeconds ? ` / ${hm(w.sleepNeedSeconds)}` : ''}`]);
  if (w.dayStrain != null) stats.push(['Strain', w.dayStrain.toFixed(1)]);
  const note = stale
    ? `Showing ${new Date(stale + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })} — today's recovery isn't scored yet`
    : w.recoveryCalibrating ? 'WHOOP is still calibrating — low confidence for now' : null;

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-900">Recovery</span>
          <span className="text-[10px] font-bold tracking-widest text-gray-400">WHOOP</span>
        </div>
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-full border-[3px] flex items-center justify-center text-xl font-extrabold ${recoveryColor(w.readinessScore)} ${recoveryBorder(w.readinessScore)}`}>
            {w.readinessScore}%
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 flex-1">
            {stats.map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] text-gray-500">{label}</div>
                <div className="text-sm font-semibold text-gray-900">{value}</div>
              </div>
            ))}
          </div>
        </div>
        {note && <p className="text-xs text-gray-500 mt-2">{note}</p>}
      </CardContent>
    </Card>
  );
}
