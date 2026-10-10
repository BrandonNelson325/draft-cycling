import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import { dailyCheckInService, type WellnessData, type WhoopReadinessStatus } from '../../services/dailyCheckInService';

const recoveryColor = (r: number) => (r >= 67 ? '#22c55e' : r >= 34 ? '#eab308' : '#ef4444');
const hm = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;

/**
 * Today's WHOOP recovery, sleep and strain. Renders nothing unless WHOOP is the
 * athlete's recovery source today — other athletes never see it.
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
  const other = (w.otherActivities || []).filter(Boolean);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Recovery</Text>
        <Text style={styles.source}>WHOOP</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.big, { color: recoveryColor(w.readinessScore) }]}>{w.readinessScore}%</Text>
        <View style={styles.stats}>
          {w.hrv != null && <Text style={styles.stat}>HRV <Text style={styles.val}>{w.hrv}ms</Text></Text>}
          {w.rhr != null && <Text style={styles.stat}>RHR <Text style={styles.val}>{w.rhr}</Text></Text>}
          {w.sleepSeconds != null && (
            <Text style={styles.stat}>
              Sleep <Text style={styles.val}>{hm(w.sleepSeconds)}{w.sleepNeedSeconds ? ` / ${hm(w.sleepNeedSeconds)}` : ''}</Text>
            </Text>
          )}
          {w.dayStrain != null && <Text style={styles.stat}>Strain <Text style={styles.val}>{w.dayStrain.toFixed(1)}</Text></Text>}
        </View>
      </View>
      {stale ? <Text style={styles.note}>Showing {new Date(stale + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short' })} — today's recovery isn't scored yet.</Text> : null}
      {w.recoveryCalibrating ? <Text style={styles.note}>WHOOP is still calibrating — low confidence for now.</Text> : null}
      {other.length > 0 && (
        <Text style={styles.note}>Off the bike: {other.map((a) => `${a.sport} ${a.minutes}min`).join(', ')}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  source: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  big: { fontSize: 40, fontWeight: '800' },
  stats: { flex: 1, gap: 2 },
  stat: { color: '#94a3b8', fontSize: 13 },
  val: { color: '#e2e8f0', fontWeight: '600' },
  note: { color: '#94a3b8', fontSize: 12, marginTop: 8 },
});
