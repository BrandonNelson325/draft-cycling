import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { Canvas, Path, Circle, Line, vec } from '@shopify/react-native-skia';
import Card from '../ui/Card';
import { chartsService, type WeeklyData } from '../../services/chartsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';

const { width } = Dimensions.get('window');
const CHART_W = width - 64;
const CHART_H = 150;
const PAD = { top: 16, right: 12, bottom: 8, left: 12 };
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

export default function WeeklyVolumeChart() {
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    chartsService.getWeeklyData(8).then(d => {
      setData(d);
      // Default to most recent week
      if (d.length > 0) setSelectedIndex(d.length - 1);
      setLoading(false);
    }).catch((err) => {
      console.warn('[WeeklyVolumeChart] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
      setError(true);
      setLoading(false);
    });
  }, [user?.id]);

  if (loading) {
    return (
      <Card>
        <Text style={styles.title}>Weekly Volume</Text>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      </Card>
    );
  }

  if (!loading && error && data.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>Weekly Volume</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginVertical: 12 }}>
          Unable to load chart data. Pull down to refresh.
        </Text>
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
  const n = data.length;

  const toX = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * IW : IW / 2);
  const toYDist = (v: number) => PAD.top + (1 - v / maxDist) * IH;
  const toYTss = (v: number) => PAD.top + (1 - v / maxTss) * IH;

  const distPts = distances.map((v, i) => ({ x: toX(i), y: toYDist(v) }));
  const tssPts = tssValues.map((v, i) => ({ x: toX(i), y: toYTss(v) }));
  const labels = data.map(d => d.week_start ? d.week_start.slice(5, 10) : '');

  const distPath = buildPath(distPts);
  const tssPath = buildPath(tssPts);
  const gridYs = [0.25, 0.5, 0.75].map(p => PAD.top + (1 - p) * IH);

  // Handle tap — find closest week based on X position
  const handleTap = (evt: any) => {
    const tapX = evt.nativeEvent.locationX;
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(tapX - toX(i));
      if (d < minDist) { minDist = d; closest = i; }
    }
    setSelectedIndex(closest);
  };

  const sel = selectedIndex ?? n - 1;
  const selDist = Math.round(distances[sel]);
  const selTss = Math.round(tssValues[sel]);
  const selLabel = labels[sel]?.replace('-', '/');

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Weekly Volume</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
            <Text style={styles.legendText}>{units.distanceUnitShort}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
            <Text style={styles.legendText}>Load</Text>
          </View>
        </View>
      </View>

      {/* Selected week summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>
            {selDist.toLocaleString()}
            <Text style={styles.summaryUnit}> {units.distanceUnitShort}</Text>
          </Text>
          <Text style={[styles.summaryLabel, { color: '#86efac' }]}>Distance</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#93c5fd' }]}>
            {selTss.toLocaleString()}
          </Text>
          <Text style={[styles.summaryLabel, { color: '#93c5fd' }]}>Training Load</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#94a3b8', fontSize: 14 }]}>
            {selLabel}
          </Text>
          <Text style={[styles.summaryLabel, { color: '#64748b' }]}>Week of</Text>
        </View>
      </View>

      {/* Chart with tap handling */}
      <Pressable onPress={handleTap}>
        <View style={{ width: CHART_W, height: CHART_H + 18 }}>
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

            {/* Selected week vertical indicator */}
            <Line
              p1={vec(toX(sel), PAD.top)}
              p2={vec(toX(sel), PAD.top + IH)}
              color="rgba(148, 163, 184, 0.2)"
              strokeWidth={1}
            />

            {/* Distance line (green) */}
            {distPath ? (
              <Path path={distPath} color="#22c55e" style="stroke" strokeWidth={2.5} />
            ) : null}
            {/* TSS line (blue) */}
            {tssPath ? (
              <Path path={tssPath} color="#3b82f6" style="stroke" strokeWidth={2.5} />
            ) : null}

            {/* Distance dots */}
            {distPts.map((p, i) => (
              <Circle
                key={`d${i}`}
                cx={p.x}
                cy={p.y}
                r={i === sel ? 6 : 3.5}
                color="#22c55e"
              />
            ))}
            {/* TSS dots */}
            {tssPts.map((p, i) => (
              <Circle
                key={`t${i}`}
                cx={p.x}
                cy={p.y}
                r={i === sel ? 6 : 3.5}
                color="#3b82f6"
              />
            ))}
          </Canvas>

          {/* X-axis week labels */}
          {labels.map((label, i) => (
            <Text
              key={`xl${i}`}
              style={[
                styles.xLabel,
                { left: toX(i) - 16, top: CHART_H + 2 },
                i === sel && styles.xLabelSelected,
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  legend: {
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#1e293b',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#86efac',
  },
  summaryUnit: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  xLabel: {
    position: 'absolute',
    width: 32,
    textAlign: 'center',
    fontSize: 9,
    color: '#64748b',
  },
  xLabelSelected: {
    color: '#f1f5f9',
    fontWeight: '600',
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
    paddingVertical: 12,
  },
});
