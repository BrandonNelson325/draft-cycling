import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface FreshnessGaugeProps {
  tsb: number;
  ctl?: number;
  atl?: number;
  showDetails?: boolean;
}

function getStatus(tsb: number) {
  if (tsb < -30) return { label: 'Overreaching', subtitle: 'Time for recovery', color: '#ef4444', bg: '#450a0a' };
  if (tsb < -20) return { label: 'Building Fitness', subtitle: 'Plan a recovery day soon', color: '#f59e0b', bg: '#1c1a00' };
  if (tsb < -5) return { label: 'Building Fitness', subtitle: 'Right where you want to be', color: '#22c55e', bg: '#052e16' };
  if (tsb <= 5) return { label: 'Balanced', subtitle: 'Recovered and ready', color: '#22c55e', bg: '#052e16' };
  if (tsb <= 25) return { label: 'Fresh', subtitle: 'Ready for a big effort', color: '#60a5fa', bg: '#1e3a5f' };
  return { label: 'Losing Fitness', subtitle: 'Time to get back on the bike', color: '#94a3b8', bg: '#1e293b' };
}

export default function FreshnessGauge({ tsb, ctl = 0, atl = 0, showDetails = true }: FreshnessGaugeProps) {
  const status = getStatus(tsb);

  return (
    <View style={styles.container}>
      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.label}
        </Text>
        <Text style={styles.statusSubtitle}>{status.subtitle}</Text>
      </View>

      {showDetails && (
        <View style={styles.metrics}>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{Math.round(ctl)}</Text>
            <Text style={styles.metricLabel}>Fitness</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricValue}>{Math.round(atl)}</Text>
            <Text style={styles.metricLabel}>Fatigue</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={[styles.metricValue, { color: status.color }]}>
              {tsb > 0 ? '+' : ''}{Math.round(tsb)}
            </Text>
            <Text style={styles.metricLabel}>Form</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  statusBadge: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 2,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 16,
  },
  statusSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  metrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
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
