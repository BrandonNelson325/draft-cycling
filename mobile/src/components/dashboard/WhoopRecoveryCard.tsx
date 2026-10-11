import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import { dailyCheckInService, type WellnessData, type WhoopReadinessStatus } from '../../services/dailyCheckInService';

const recoveryColor = (r: number) => (r >= 67 ? '#22c55e' : r >= 34 ? '#eab308' : '#ef4444');
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;

/**
 * Today's WHOOP recovery, sleep and strain — a compact, visually separate
 * section inside the Coach card (its own bordered panel, so it never blends
 * into the coach's words). Renders nothing for athletes without WHOOP.
 */
export default function WhoopRecoveryCard() {
  const [w, setW] = useState<Partial<WellnessData> | null>(null);
  const [stale, setStale] = useState<string | null>(null); // date of the latest scored day when today isn't in yet

  useEffect(() => {
    dailyCheckInService.getDailyReadiness()
      .then((r) => {
        if (r?.wellness?.source === 'whoop') { setW(r.wellness); setStale(null); return; }
        // Whoop connected but today not scored yet → show the latest day, labeled.
        const latest = (r?.whoop as WhoopReadinessStatus | undefined)?.latest;
        if (r?.whoop?.connected && latest) {
          setW({ readinessScore: latest.readinessScore, hrv: latest.hrv, rhr: latest.rhr, sleepSeconds: latest.sleepSeconds, sleepNeedSeconds: latest.sleepNeedSeconds, dayStrain: latest.dayStrain });
          setStale(latest.date);
        } else setW(null);
      })
      .catch(() => setW(null));
  }, []);

  if (!w || w.readinessScore == null) return null;

  const stats = [
    w.hrv != null ? `HRV ${w.hrv}` : null,
    w.rhr != null ? `RHR ${w.rhr}` : null,
    w.sleepSeconds != null ? `Sleep ${hm(w.sleepSeconds)}${w.sleepNeedSeconds ? `/${hm(w.sleepNeedSeconds)}` : ''}` : null,
    w.dayStrain != null ? `Strain ${w.dayStrain.toFixed(1)}` : null,
  ].filter(Boolean).join(' · ');
  const note = stale
    ? `${new Date(stale + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })} · today not scored yet`
    : w.recoveryCalibrating ? 'calibrating' : null;

  return (
    <Card style={styles.strip}>
      <View style={[styles.badge, { borderColor: recoveryColor(w.readinessScore) }]}>
        <Text style={[styles.badgeText, { color: recoveryColor(w.readinessScore) }]}>{w.readinessScore}%</Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.topRow}>
          <Text style={styles.title}>Recovery</Text>
          <Text style={styles.source}>WHOOP{note ? ` · ${note}` : ''}</Text>
        </View>
        <Text style={styles.stats} numberOfLines={1}>{stats}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  badge: { borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, minWidth: 58, alignItems: 'center' },
  badgeText: { fontSize: 17, fontWeight: '800' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#e2e8f0', fontSize: 13, fontWeight: '700' },
  source: { color: '#64748b', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  stats: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
});
