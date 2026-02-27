import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import Card from '../ui/Card';
import { metricsService } from '../../services/metricsService';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - 64;
const CHART_HEIGHT = 100;

const DURATIONS = ['5s', '1m', '5m', '20m'];

export default function PowerCurveChart() {
  const [prs, setPrs] = useState<{ power_5sec: number; power_1min: number; power_5min: number; power_20min: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    metricsService.getMetrics('all').then(d => {
      setPrs(d.power_prs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <Text style={styles.title}>Power Curve</Text>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      </Card>
    );
  }

  const values = prs ? [prs.power_5sec, prs.power_1min, prs.power_5min, prs.power_20min] : [];
  const maxVal = Math.max(...values, 1);
  const barW = Math.floor((CHART_WIDTH - 3 * 12) / 4);

  return (
    <Card>
      <Text style={styles.title}>Power Records</Text>
      <View style={[styles.chart, { height: CHART_HEIGHT }]}>
        {DURATIONS.map((dur, i) => {
          const val = values[i] || 0;
          const pct = val / maxVal;
          return (
            <View key={dur} style={[styles.barGroup, { width: barW }]}>
              <Text style={styles.wattLabel}>{val > 0 ? `${Math.round(val)}w` : '—'}</Text>
              <View style={styles.barWrapper}>
                <View
                  style={[
                    styles.bar,
                    { height: Math.max(2, pct * CHART_HEIGHT * 0.75) },
                  ]}
                />
              </View>
              <Text style={styles.durLabel}>{dur}</Text>
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
    marginBottom: 12,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  barGroup: {
    alignItems: 'center',
    gap: 4,
  },
  barWrapper: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    backgroundColor: '#8b5cf6',
    borderRadius: 4,
  },
  wattLabel: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  durLabel: {
    fontSize: 11,
    color: '#64748b',
  },
});
