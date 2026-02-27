import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface FreshnessGaugeProps {
  tsb: number;
  ctl: number;
  atl: number;
}

function getStatus(tsb: number) {
  if (tsb < -30) return { label: 'Overtrained', color: '#ef4444', bg: '#450a0a' };
  if (tsb < -10) return { label: 'Fatigued', color: '#f97316', bg: '#431407' };
  if (tsb <= 5) return { label: 'Optimal', color: '#22c55e', bg: '#052e16' };
  if (tsb <= 25) return { label: 'Fresh', color: '#60a5fa', bg: '#1e3a5f' };
  return { label: 'Detraining', color: '#94a3b8', bg: '#1e293b' };
}

export default function FreshnessGauge({ tsb, ctl, atl }: FreshnessGaugeProps) {
  const status = getStatus(tsb);
  // Map TSB from [-40, 40] to [0%, 100%]
  const pct = Math.max(0, Math.min(100, ((tsb + 40) / 80) * 100));

  return (
    <View style={styles.container}>
      <View style={styles.gaugeWrapper}>
        <LinearGradient
          colors={['#ef4444', '#f97316', '#eab308', '#22c55e', '#60a5fa']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gauge}
        />
        {/* Indicator needle */}
        <View style={[styles.needle, { left: `${pct}%` as any }]} />
      </View>

      <View style={styles.labels}>
        <Text style={styles.labelText}>-40</Text>
        <Text style={styles.labelText}>0</Text>
        <Text style={styles.labelText}>+40</Text>
      </View>

      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.label}  TSB: {tsb > 0 ? '+' : ''}{Math.round(tsb)}
        </Text>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>CTL (Fitness)</Text>
          <Text style={styles.metricValue}>{Math.round(ctl)}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>ATL (Fatigue)</Text>
          <Text style={styles.metricValue}>{Math.round(atl)}</Text>
        </View>
        <View style={styles.metricItem}>
          <Text style={styles.metricLabel}>TSB (Form)</Text>
          <Text style={[styles.metricValue, { color: status.color }]}>
            {tsb > 0 ? '+' : ''}{Math.round(tsb)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  gaugeWrapper: {
    height: 16,
    borderRadius: 8,
    overflow: 'visible',
    position: 'relative',
  },
  gauge: {
    height: 16,
    borderRadius: 8,
  },
  needle: {
    position: 'absolute',
    top: -4,
    width: 4,
    height: 24,
    backgroundColor: '#fff',
    borderRadius: 2,
    marginLeft: -2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  labelText: {
    fontSize: 11,
    color: '#64748b',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'center',
  },
  statusText: {
    fontWeight: '600',
    fontSize: 13,
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  metricItem: {
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
});
