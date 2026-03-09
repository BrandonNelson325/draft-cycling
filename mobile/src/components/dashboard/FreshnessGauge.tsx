import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface FreshnessGaugeProps {
  tsb: number;
  ctl?: number;
  atl?: number;
  showDetails?: boolean;
}

// Gradient stops: Red (0%) → Green (50%) → Blue (100%)
const GRADIENT_STOPS = [
  { pos: 0, r: 239, g: 68, b: 68 },    // #ef4444 red
  { pos: 0.5, r: 34, g: 197, b: 94 },   // #22c55e green
  { pos: 1, r: 59, g: 130, b: 246 },     // #3b82f6 blue
];

function interpolateColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  let i = 0;
  while (i < GRADIENT_STOPS.length - 2 && GRADIENT_STOPS[i + 1].pos < t) i++;
  const a = GRADIENT_STOPS[i];
  const b = GRADIENT_STOPS[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  const r = Math.round(a.r + (b.r - a.r) * localT);
  const g = Math.round(a.g + (b.g - a.g) * localT);
  const bl = Math.round(a.b + (b.b - a.b) * localT);
  return `rgb(${r}, ${g}, ${bl})`;
}

function darkenColor(pct: number): string {
  const t = Math.max(0, Math.min(1, pct / 100));
  let i = 0;
  while (i < GRADIENT_STOPS.length - 2 && GRADIENT_STOPS[i + 1].pos < t) i++;
  const a = GRADIENT_STOPS[i];
  const b = GRADIENT_STOPS[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  const r = Math.round((a.r + (b.r - a.r) * localT) * 0.15);
  const g = Math.round((a.g + (b.g - a.g) * localT) * 0.15);
  const bl = Math.round((a.b + (b.b - a.b) * localT) * 0.15);
  return `rgb(${r}, ${g}, ${bl})`;
}

function getStatus(tsb: number) {
  if (tsb < -30) return { label: 'Overreaching', subtitle: 'Time for recovery' };
  if (tsb < -20) return { label: 'Optimal', subtitle: 'Recovery day coming up' };
  if (tsb < -5) return { label: 'Optimal', subtitle: 'Right where you want to be' };
  if (tsb < 5) return { label: 'Balanced', subtitle: 'Recovered and ready' };
  if (tsb < 25) return { label: 'Fresh', subtitle: 'Ready for a big effort' };
  return { label: 'Detrained', subtitle: 'Time to get back on the bike' };
}

export default function FreshnessGauge({ tsb, ctl = 0, atl = 0, showDetails = true }: FreshnessGaugeProps) {
  const status = getStatus(tsb);
  // Map TSB from [-40, 40] to [0%, 100%]
  const pct = Math.max(0, Math.min(100, ((tsb + 40) / 80) * 100));
  const color = interpolateColor(pct);
  const bg = darkenColor(pct);

  return (
    <View style={styles.container}>
      <View style={styles.gaugeWrapper}>
        <LinearGradient
          colors={['#ef4444', '#22c55e', '#3b82f6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gauge}
        />
        {/* Indicator needle */}
        <View style={[styles.needle, { left: `${pct}%` as any }]} />
      </View>

      <View style={styles.labels}>
        <Text style={styles.labelText}>Tired</Text>
        <Text style={styles.labelText}>Optimal</Text>
        <Text style={styles.labelText}>Fresh</Text>
      </View>

      <View style={[styles.statusBadge, { backgroundColor: bg }]}>
        <Text style={[styles.statusText, { color }]}>
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
            <Text style={[styles.metricValue, { color }]}>
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
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 15,
  },
  statusSubtitle: {
    fontSize: 11,
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
