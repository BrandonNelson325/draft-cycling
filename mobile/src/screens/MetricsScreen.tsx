import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Card from '../components/ui/Card';
import { metricsService, type MetricsData } from '../services/metricsService';
import { useAuthStore } from '../stores/useAuthStore';
import { getConversionUtils } from '../utils/units';
import { formatDuration } from '../utils/date';

export default function MetricsScreen() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  useEffect(() => {
    metricsService.getMetrics('all').then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color="#3b82f6" style={{ marginTop: 40 }} />
        ) : data ? (
          <>
            <Card>
              <Text style={styles.sectionTitle}>All-Time Totals</Text>
              <Row label="Rides" value={String(data.ride_count)} />
              <Row label={`Distance (${units.distanceUnitShort})`} value={units.formatDistance(data.total_distance_meters)} />
              <Row label="Moving Time" value={formatDuration(data.total_time_seconds)} />
              <Row label={`Elevation (${units.elevationUnitShort})`} value={units.formatElevation(data.total_elevation_meters)} />
              <Row label="Total TSS" value={String(Math.round(data.total_tss))} />
            </Card>

            {data.power_prs && (
              <Card>
                <Text style={styles.sectionTitle}>Power Records</Text>
                <Row label="5-second" value={data.power_prs.power_5sec ? `${Math.round(data.power_prs.power_5sec)}W` : '—'} />
                <Row label="1-minute" value={data.power_prs.power_1min ? `${Math.round(data.power_prs.power_1min)}W` : '—'} />
                <Row label="5-minute" value={data.power_prs.power_5min ? `${Math.round(data.power_prs.power_5min)}W` : '—'} />
                <Row label="20-minute" value={data.power_prs.power_20min ? `${Math.round(data.power_prs.power_20min)}W` : '—'} />
              </Card>
            )}
          </>
        ) : (
          <Text style={styles.empty}>No metrics available yet.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  rowLabel: { fontSize: 14, color: '#94a3b8' },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#f1f5f9' },
  empty: { color: '#64748b', fontSize: 14, textAlign: 'center', marginTop: 40 },
});
