import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface FreshnessGaugeProps {
  tsb: number;
  ctl?: number;
  atl?: number;
  showDetails?: boolean;
}

// HSL interpolation avoids the muddy brown of RGB red→green blending.
// Gradient: Red (hue 0) → Yellow (60) → Green (145) → Cyan (190) → Blue (220)
// We define stops in HSL, then convert to RGB for rendering.
const HSL_STOPS = [
  { pos: 0, h: 0, s: 85, l: 55 },       // red
  { pos: 0.25, h: 45, s: 90, l: 50 },    // orange-yellow
  { pos: 0.5, h: 145, s: 70, l: 45 },    // green
  { pos: 0.75, h: 190, s: 75, l: 50 },   // teal-cyan
  { pos: 1, h: 220, s: 90, l: 60 },      // blue
];

function hslToRgb(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `rgb(${Math.round(f(0) * 255)}, ${Math.round(f(8) * 255)}, ${Math.round(f(4) * 255)})`;
}

function interpolateHsl(pct: number): { h: number; s: number; l: number } {
  const t = Math.max(0, Math.min(1, pct / 100));
  let i = 0;
  while (i < HSL_STOPS.length - 2 && HSL_STOPS[i + 1].pos < t) i++;
  const a = HSL_STOPS[i];
  const b = HSL_STOPS[i + 1];
  const localT = (t - a.pos) / (b.pos - a.pos);
  return {
    h: a.h + (b.h - a.h) * localT,
    s: a.s + (b.s - a.s) * localT,
    l: a.l + (b.l - a.l) * localT,
  };
}

function interpolateColor(pct: number): string {
  const { h, s, l } = interpolateHsl(pct);
  return hslToRgb(h, s, l);
}

function textColorForBg(pct: number): string {
  const { l } = interpolateHsl(pct);
  return l > 50 ? '#000000' : '#ffffff';
}

function getStatus(tsb: number) {
  if (tsb < -30) return { label: 'Overreaching', subtitle: 'Training load is too high — take a rest day' };
  if (tsb < -20) return { label: 'Optimal', subtitle: 'Fitness is building — plan recovery soon' };
  if (tsb < -5) return { label: 'Optimal', subtitle: 'On track and absorbing training well' };
  if (tsb < 5) return { label: 'Balanced', subtitle: 'Fully recovered and ready to train' };
  if (tsb < 25) return { label: 'Fresh', subtitle: 'Peak form — ideal for racing or hard efforts' };
  return { label: 'Detrained', subtitle: 'Fitness is fading — time to start riding again' };
}

// Pre-computed hex colors at each stop for the LinearGradient component
const GRADIENT_COLORS = HSL_STOPS.map(s => hslToRgb(s.h, s.s, s.l));

export default function FreshnessGauge({ tsb, ctl = 0, atl = 0, showDetails = true }: FreshnessGaugeProps) {
  const status = getStatus(tsb);
  // Map TSB from [-40, 40] to [0%, 100%]
  const pct = Math.max(0, Math.min(100, ((tsb + 40) / 80) * 100));
  const bg = interpolateColor(pct);
  const textColor = textColorForBg(pct);

  return (
    <View style={styles.container}>
      <View style={styles.gaugeWrapper}>
        <LinearGradient
          colors={GRADIENT_COLORS as any}
          locations={HSL_STOPS.map(s => s.pos)}
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
        <Text style={[styles.statusText, { color: textColor }]}>
          {status.label}
        </Text>
        <Text style={[styles.statusSubtitle, { color: textColor, opacity: 0.8 }]}>{status.subtitle}</Text>
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
            <Text style={[styles.metricValue, { color: bg }]}>
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
