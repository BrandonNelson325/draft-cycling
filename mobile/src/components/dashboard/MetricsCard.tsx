import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Card from '../ui/Card';
import { metricsService, type MetricsData } from '../../services/metricsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';
import { formatDuration } from '../../utils/date';

type Period = 'week' | 'month' | 'year' | 'all';
const PERIODS: Period[] = ['week', 'month', 'year', 'all'];
const PERIOD_LABELS: Record<Period, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
  all: 'All',
};

export default function MetricsCard() {
  const [period, setPeriod] = useState<Period>('week');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  useEffect(() => {
    load();
  }, [period]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await metricsService.getMetrics(period);
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Text style={styles.title}>Training Metrics</Text>

      {/* Period selector */}
      <View style={styles.tabs}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.tab, period === p && styles.tabActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      ) : data ? (
        <View style={styles.grid}>
          <StatBox label="Rides" value={String(data.ride_count)} />
          <StatBox label={`Distance (${units.distanceUnitShort})`} value={units.formatDistance(data.total_distance_meters)} />
          <StatBox label="Time" value={formatDuration(data.total_time_seconds)} />
          <StatBox label="Elevation" value={`${units.formatElevation(data.total_elevation_meters)}${units.elevationUnitShort}`} />
          <StatBox label="TSS" value={String(Math.round(data.total_tss))} />
          <StatBox label="20m Power" value={data.power_prs?.power_20min ? `${data.power_prs.power_20min}w` : '—'} />
        </View>
      ) : (
        <Text style={styles.empty}>No data for this period</Text>
      )}
    </Card>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  tabActive: {
    backgroundColor: '#1e3a5f',
  },
  tabText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#60a5fa',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    width: '30%',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
});
