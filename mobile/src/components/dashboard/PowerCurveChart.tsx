import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions, TouchableOpacity } from 'react-native';
import { Canvas, Path, Circle } from '@shopify/react-native-skia';
import Card from '../ui/Card';
import { metricsService } from '../../services/metricsService';
import { useAuthStore } from '../../stores/useAuthStore';

const { width } = Dimensions.get('window');
const CHART_W = width - 64;
const CHART_H = 140;
const PAD = { top: 20, right: 8, bottom: 8, left: 8 };
const IW = CHART_W - PAD.left - PAD.right;
const IH = CHART_H - PAD.top - PAD.bottom;

/** Cardinal spline → cubic bezier SVG path */
function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const t = 0.35;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const prev2 = i >= 2 ? pts[i - 2] : p0;
    const next = i < pts.length - 1 ? pts[i + 1] : p1;
    const cp1x = p0.x + (p1.x - prev2.x) * t;
    const cp1y = p0.y + (p1.y - prev2.y) * t;
    const cp2x = p1.x - (next.x - p0.x) * t;
    const cp2y = p1.y - (next.y - p0.y) * t;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

export default function PowerCurveChart() {
  const [prs, setPrs] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState<'8weeks' | 'all'>('all');
  const [unit, setUnit] = useState<'watts' | 'wkg'>('watts');
  const weightKg = useAuthStore(s => s.user?.weight_kg);

  useEffect(() => {
    setLoading(true);
    metricsService.getMetrics(period).then(d => {
      setPrs(d.power_prs as unknown as Record<string, number>);
      setLoading(false);
    }).catch((err) => {
      console.warn('[PowerCurveChart] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
      setError(true);
      setLoading(false);
    });
  }, [period]);

  if (loading) {
    return (
      <Card>
        <Text style={styles.title}>Power Curve</Text>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      </Card>
    );
  }

  if (!loading && error && !prs) {
    return (
      <Card>
        <Text style={styles.title}>Power Curve</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginVertical: 12 }}>
          Unable to load power data. Pull down to refresh.
        </Text>
      </Card>
    );
  }

  // Sanitize all values — guard against undefined/null from older backend responses.
  // 15s and 30s are estimated from 5sec (same approach as the web chart).
  const p5s = (prs?.power_5sec) || 0;
  const rawCandidates: { dur: string; val: number }[] = [
    { dur: '5s',  val: p5s },
    { dur: '15s', val: Math.round(p5s * 0.95) },
    { dur: '30s', val: Math.round(p5s * 0.90) },
    { dur: '1m',  val: (prs?.power_1min)  || 0 },
    { dur: '3m',  val: (prs?.power_3min)  || 0 },
    { dur: '5m',  val: (prs?.power_5min)  || 0 },
    { dur: '10m', val: (prs?.power_10min) || 0 },
    { dur: '20m', val: (prs?.power_20min) || 0 },
  ];

  const showWkg = unit === 'wkg' && weightKg && weightKg > 0;
  const candidates = rawCandidates.map(p => ({
    dur: p.dur,
    val: showWkg ? parseFloat((p.val / weightKg!).toFixed(2)) : p.val,
    rawWatts: p.val,
  }));

  // Only plot durations where we actually have a value — avoids ugly zero dips
  // and the NaN-in-SVG-path bug when new fields aren't in the backend yet.
  const points = candidates.filter(p => p.rawWatts > 0);

  if (points.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>Power Curve</Text>
        <Text style={styles.empty}>No power data yet</Text>
      </Card>
    );
  }

  const maxVal = Math.max(...points.map(p => p.val), 1);
  const n = points.length;

  const toX = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * IW : IW / 2);
  const toY = (v: number) => PAD.top + (1 - v / maxVal) * IH;

  const pts = points.map((p, i) => ({ x: toX(i), y: toY(p.val) }));
  const linePath = buildPath(pts);
  const gridYs = [0.25, 0.5, 0.75].map(p => PAD.top + (1 - p) * IH);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.title}>Power Curve</Text>
        <View style={styles.toggle}>
          {weightKg && weightKg > 0 ? (
            <>
              <TouchableOpacity
                style={[styles.toggleBtn, unit === 'watts' && styles.toggleBtnActive]}
                onPress={() => setUnit('watts')}
              >
                <Text style={[styles.toggleText, unit === 'watts' && styles.toggleTextActive]}>W</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, unit === 'wkg' && styles.toggleBtnActive]}
                onPress={() => setUnit('wkg')}
              >
                <Text style={[styles.toggleText, unit === 'wkg' && styles.toggleTextActive]}>W/kg</Text>
              </TouchableOpacity>
              <View style={styles.toggleDivider} />
            </>
          ) : null}
          <TouchableOpacity
            style={[styles.toggleBtn, period === '8weeks' && styles.toggleBtnActive]}
            onPress={() => setPeriod('8weeks')}
          >
            <Text style={[styles.toggleText, period === '8weeks' && styles.toggleTextActive]}>8 Weeks</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, period === 'all' && styles.toggleBtnActive]}
            onPress={() => setPeriod('all')}
          >
            <Text style={[styles.toggleText, period === 'all' && styles.toggleTextActive]}>All Time</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{ width: CHART_W, height: CHART_H + 36 }}>
        <Canvas style={{ width: CHART_W, height: CHART_H }}>
          {/* Grid lines */}
          {gridYs.map((gy, i) => (
            <Path
              key={i}
              path={`M ${PAD.left} ${gy.toFixed(1)} L ${(CHART_W - PAD.right).toFixed(1)} ${gy.toFixed(1)}`}
              color="#1e3a5f"
              style="stroke"
              strokeWidth={1}
            />
          ))}
          {/* Power line */}
          {linePath ? (
            <Path path={linePath} color="#22c55e" style="stroke" strokeWidth={2.5} />
          ) : null}
          {/* Dots */}
          {pts.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={4} color="#22c55e" />
          ))}
        </Canvas>

        {/* Value label above each dot */}
        {points.map((p, i) => (
          <Text
            key={`w${i}`}
            style={[styles.wattLabel, { left: toX(i) - 18, top: Math.max(0, pts[i].y - 14) }]}
          >
            {showWkg ? p.val.toFixed(1) : p.val + 'w'}
          </Text>
        ))}

        {/* Duration labels below canvas */}
        {points.map((p, i) => (
          <Text
            key={`d${i}`}
            style={[styles.durLabel, { left: toX(i) - 12, top: CHART_H + 2 }]}
          >
            {p.dur}
          </Text>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  toggle: {
    flexDirection: 'row',
    gap: 4,
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#0f172a',
  },
  toggleBtnActive: {
    backgroundColor: '#1e3a5f',
  },
  toggleDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#334155',
    marginHorizontal: 2,
    alignSelf: 'center' as const,
  },
  toggleText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  toggleTextActive: {
    color: '#60a5fa',
  },
  wattLabel: {
    position: 'absolute',
    width: 36,
    textAlign: 'center',
    fontSize: 8,
    color: '#86efac',
    fontWeight: '600',
  },
  durLabel: {
    position: 'absolute',
    width: 24,
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
