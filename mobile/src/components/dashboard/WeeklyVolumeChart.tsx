import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { Canvas, Path, Circle } from '@shopify/react-native-skia';
import Card from '../ui/Card';
import { chartsService, type WeeklyData } from '../../services/chartsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';

const { width } = Dimensions.get('window');
const CHART_W = width - 64;
const CHART_H = 160;
// Extra top/bottom padding so value labels don't clip at the extremes
const PAD = { top: 20, right: 12, bottom: 8, left: 12 };
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
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    chartsService.getWeeklyData(8).then(d => {
      setData(d);
      setLoading(false);
    }).catch((err) => {
      console.warn('[WeeklyVolumeChart] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
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

  // Value label placement: distance label goes ABOVE its dot, TSS label goes BELOW its dot.
  // Clamp so labels stay within [0, CHART_H].
  const LABEL_H = 12; // approximate label height in px
  const DOT_R = 4;

  return (
    <Card>
      <Text style={styles.title}>Weekly Volume</Text>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.legendText}>Distance ({units.distanceUnitShort})</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
          <Text style={styles.legendText}>Training Load</Text>
        </View>
      </View>

      {/* Canvas + absolutely-positioned labels share this container */}
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
            <Circle key={`d${i}`} cx={p.x} cy={p.y} r={DOT_R} color="#22c55e" />
          ))}
          {/* TSS dots */}
          {tssPts.map((p, i) => (
            <Circle key={`t${i}`} cx={p.x} cy={p.y} r={DOT_R} color="#3b82f6" />
          ))}
        </Canvas>

        {/* Distance value labels — above each distance dot */}
        {distPts.map((p, i) => (
          <Text
            key={`dv${i}`}
            style={[
              styles.valueLabel,
              {
                color: '#86efac',
                left: toX(i) - 16,
                top: Math.max(0, p.y - LABEL_H - DOT_R - 1),
              },
            ]}
          >
            {Math.round(distances[i])}{units.distanceUnitShort}
          </Text>
        ))}

        {/* TSS value labels — below each TSS dot */}
        {tssPts.map((p, i) => (
          <Text
            key={`tv${i}`}
            style={[
              styles.valueLabel,
              {
                color: '#93c5fd',
                left: toX(i) - 14,
                top: Math.min(CHART_H - LABEL_H, p.y + DOT_R + 1),
              },
            ]}
          >
            {Math.round(tssValues[i])}
          </Text>
        ))}

        {/* X-axis week labels — below the canvas */}
        {labels.map((label, i) => (
          <Text
            key={`xl${i}`}
            style={[styles.xLabel, { left: toX(i) - 16, top: CHART_H + 2 }]}
          >
            {label}
          </Text>
        ))}
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
  valueLabel: {
    position: 'absolute',
    width: 32,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '600',
  },
  xLabel: {
    position: 'absolute',
    width: 32,
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
