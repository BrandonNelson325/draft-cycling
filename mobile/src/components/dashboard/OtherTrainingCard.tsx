import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Card from '../ui/Card';
import { crossTrainingService, type CrossTrainingActivity } from '../../services/crossTrainingService';
import { useAuthStore } from '../../stores/useAuthStore';

const ICON: Record<string, string> = {
  run: '🏃', trail_run: '🏃', walk: '🚶', hike: '🥾', swim: '🏊', row: '🚣', paddle: '🛶',
  nordic_ski: '⛷️', alpine_ski: '⛷️', strength: '🏋️', mobility: '🧘', team_sport: '⚽',
  racket: '🎾', climb: '🧗', skate: '⛸️', other: '💪',
};

/**
 * Non-cycling training (from Strava) and how it affects cycling: each session's
 * fatigue load + a plain-English effect, and the 7-day total. Hidden when empty.
 */
export default function OtherTrainingCard() {
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
      <View style={styles.header}>
        <Text style={styles.title}>Other training</Text>
        <Text style={styles.week}>7-day fatigue load: <Text style={styles.weekVal}>{weekLoad}</Text></Text>
      </View>
      {items.slice(0, 5).map((a) => (
        <View key={a.id} style={styles.row}>
          <Text style={styles.icon}>{ICON[a.category] || ICON.other}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {a.label}{a.name ? ` · ${a.name}` : ''}
            </Text>
            <Text style={styles.meta}>
              {new Date(a.start_date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              {a.duration_min ? ` · ${a.duration_min} min` : ''}
              {dist(a.distance_meters) ? ` · ${dist(a.distance_meters)}` : ''}
              {a.avg_hr ? ` · ${a.avg_hr} bpm` : ''}
            </Text>
            <Text style={styles.effect}>{a.effect}</Text>
          </View>
          {a.fatigue_load != null && (
            <View style={styles.loadPill}>
              <Text style={styles.loadVal}>{a.fatigue_load}</Text>
              <Text style={styles.loadLbl}>load</Text>
            </View>
          )}
        </View>
      ))}
      <Text style={styles.foot}>Counts toward your fatigue and form; your coach plans around it.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  title: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  week: { color: '#64748b', fontSize: 12 },
  weekVal: { color: '#e2e8f0', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#1e293b' },
  icon: { fontSize: 20, marginTop: 2 },
  name: { color: '#e2e8f0', fontSize: 14, fontWeight: '600' },
  meta: { color: '#94a3b8', fontSize: 12, marginTop: 1 },
  effect: { color: '#64748b', fontSize: 11, marginTop: 2 },
  loadPill: { alignItems: 'center', minWidth: 44 },
  loadVal: { color: '#f97316', fontSize: 16, fontWeight: '800' },
  loadLbl: { color: '#64748b', fontSize: 10 },
  foot: { color: '#64748b', fontSize: 11, marginTop: 8 },
});
