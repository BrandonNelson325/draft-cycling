import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { dailyCheckInService, type WellnessData } from '../../services/dailyCheckInService';

const recoveryColor = (r: number) => (r >= 67 ? 'text-green-600' : r >= 34 ? 'text-yellow-500' : 'text-red-600');
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;

/**
 * Today's WHOOP recovery, sleep and strain. Renders nothing unless WHOOP is
 * the athlete's recovery source today.
 */
export function WhoopRecoveryCard() {
  const [w, setW] = useState<WellnessData | null>(null);

  useEffect(() => {
    dailyCheckInService.getDailyReadiness()
      .then((r) => setW(r?.wellness?.source === 'whoop' ? r.wellness : null))
      .catch(() => setW(null));
  }, []);

  if (!w || w.readinessScore == null) return null;
  const other = (w.otherActivities || []).filter(Boolean);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>Recovery</CardTitle>
          <span className="text-[10px] font-bold tracking-widest text-gray-400">WHOOP</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          <div className={`text-5xl font-extrabold ${recoveryColor(w.readinessScore)}`}>{w.readinessScore}%</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
            {w.hrv != null && <div>HRV <span className="font-semibold text-gray-900">{w.hrv}ms</span></div>}
            {w.rhr != null && <div>RHR <span className="font-semibold text-gray-900">{w.rhr}</span></div>}
            {w.sleepSeconds != null && (
              <div>Sleep <span className="font-semibold text-gray-900">{hm(w.sleepSeconds)}{w.sleepNeedSeconds ? ` / ${hm(w.sleepNeedSeconds)}` : ''}</span></div>
            )}
            {w.dayStrain != null && <div>Strain <span className="font-semibold text-gray-900">{w.dayStrain.toFixed(1)}</span></div>}
          </div>
        </div>
        {w.recoveryCalibrating && <p className="text-xs text-gray-500 mt-2">WHOOP is still calibrating — low confidence for now.</p>}
        {other.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">Off the bike: {other.map((a) => `${a.sport} ${a.minutes}min`).join(', ')}</p>
        )}
      </CardContent>
    </Card>
  );
}
