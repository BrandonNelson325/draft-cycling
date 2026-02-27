import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import Card from '../ui/Card';
import { chartsService, type WeeklyData } from '../../services/chartsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64; // screen - padding - card padding
const CHART_HEIGHT = 120;

export default function WeeklyVolumeChart() {
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  useEffect(() => {
    chartsService.getWeeklyData(8).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <Text style={styles.title}>Weekly Volume</Text>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card>
        <Text style={styles.title}>Weekly Volume</Text>
        <Text style={styles.empty}>No data yet</Text>
      </Card>
    );
  }

  const distances = data.map(d => units.formatDistanceValue(d.total_distance_meters));
  const tssValues = data.map(d => d.total_tss);
  const maxDist = Math.max(...distances, 1);
  const maxTss = Math.max(...tssValues, 1);
  const barWidth = Math.floor((CHART_WIDTH - (data.length - 1) * 4) / data.length);

  return (
    <Card>
      <Text style={styles.title}>Weekly Volume</Text>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.legendText}>Distance ({units.distanceUnitShort})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.legendText}>TSS</Text>
        </View>
      </View>

      <View style={[styles.chartArea, { height: CHART_HEIGHT }]}>
        {data.map((week, i) => {
          const distPct = distances[i] / maxDist;
          const tssPct = tssValues[i] / maxTss;
          const label = week.week_start ? week.week_start.slice(5, 10) : `W${i + 1}`;
          return (
            <View key={i} style={[styles.barGroup, { width: barWidth }]}>
              {/* Distance bar */}
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(2, distPct * CHART_HEIGHT * 0.85), backgroundColor: '#3b82f6' },
                  ]}
                />
              </View>
              {/* TSS bar offset slightly */}
              <View style={[styles.barWrapper, { marginLeft: 2 }]}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(2, tssPct * CHART_HEIGHT * 0.85), backgroundColor: '#f59e0b', opacity: 0.7 },
                  ]}
                />
              </View>
              <Text style={styles.barLabel}>{label}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 10,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    position: 'relative',
  },
  barWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: 3,
  },
  barLabel: {
    position: 'absolute',
    bottom: -16,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 9,
    color: '#64748b',
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
    paddingVertical: 12,
  },
});
