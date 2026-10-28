import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import { whoopRecoveryColor } from '../../utils/whoopBrand';
import { dailyCheckInService, type WellnessData, type WhoopReadinessStatus } from '../../services/dailyCheckInService';

const recoveryColor = whoopRecoveryColor;
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

  const stats: [string, string][] = [];
  if (w.hrv != null) stats.push(['HRV', `${w.hrv} ms`]);
  if (w.rhr != null) stats.push(['Resting HR', `${w.rhr} bpm`]);
  if (w.sleepSeconds != null) stats.push(['Sleep', `${hm(w.sleepSeconds)}${w.sleepNeedSeconds ? ` / ${hm(w.sleepNeedSeconds)}` : ''}`]);
  if (w.dayStrain != null) stats.push(['Strain', w.dayStrain.toFixed(1)]);
  const note = stale
    ? `Showing ${new Date(stale + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })} — today's recovery isn't scored yet`
    : w.recoveryCalibrating ? 'WHOOP is still calibrating — low confidence for now' : null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery</Text>
        <Text style={styles.source}>WHOOP</Text>
      </View>
      <View style={styles.row}>
        <View style={[styles.badge, { borderColor: recoveryColor(w.readinessScore) }]}>
          <Text style={[styles.badgeText, { color: recoveryColor(w.readinessScore) }]}>{w.readinessScore}%</Text>
        </View>
        <View style={styles.grid}>
          {stats.map(([label, value]) => (
            <View key={label} style={styles.cell}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{value}</Text>
            </View>
          ))}
        </View>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, paddingHorizontal: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: '#f1f5f9', fontSize: 15, fontWeight: '700' },
  source: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: { borderWidth: 3, borderRadius: 999, width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 21, fontWeight: '800' },
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  cell: { width: '50%' },
  label: { color: '#64748b', fontSize: 11 },
  value: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  note: { color: '#94a3b8', fontSize: 12, marginTop: 8 },
});
