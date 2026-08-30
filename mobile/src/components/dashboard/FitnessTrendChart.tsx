import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { Canvas, Path, Circle, Line, vec } from '@shopify/react-native-skia';
import Card from '../ui/Card';
import { chartsService, type FitnessData } from '../../services/chartsService';
import { useAuthStore } from '../../stores/useAuthStore';

const { width } = Dimensions.get('window');
const CHART_W = width - 64;
const CHART_H = 150;
const PAD = { top: 16, right: 12, bottom: 8, left: 12 };
const IW = CHART_W - PAD.left - PAD.right;
const IH = CHART_H - PAD.top - PAD.bottom;

const FITNESS_COLOR = '#3b82f6'; // blue — CTL
const FATIGUE_COLOR = '#f59e0b'; // amber — ATL

/** Monotone cubic Hermite interpolation → smooth SVG path without overshooting */
function buildPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
  }
  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    slopes.push(dx[i] === 0 ? 0 : dy[i] / dx[i]);
  }
  const tangents: number[] = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) tangents.push(0);
    else tangents.push((slopes[i - 1] + slopes[i]) / 2);
  }
  tangents.push(slopes[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (Math.abs(slopes[i]) < 1e-6) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / slopes[i];
      const beta = tangents[i + 1] / slopes[i];
      const mag = alpha * alpha + beta * beta;
      if (mag > 9) {
        const tau = 3 / Math.sqrt(mag);
        tangents[i] = tau * alpha * slopes[i];
        tangents[i + 1] = tau * beta * slopes[i];
      }
    }
  }
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = pts[i].x + seg;
    const cp1y = pts[i].y + tangents[i] * seg;
    const cp2x = pts[i + 1].x - seg;
    const cp2y = pts[i + 1].y - tangents[i + 1] * seg;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function formatLabel(dateStr: string): string {
  // YYYY-MM-DD → M/D (parse as local, not UTC, to avoid off-by-one)
  const parts = dateStr.split('-');
  if (parts.length !== 3) return '';
  return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
}

export default function FitnessTrendChart() {
  const [data, setData] = useState<FitnessData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    chartsService.getFitnessTimeSeries(42).then(d => {
      setData(d);
      if (d.length > 0) setSelectedIndex(d.length - 1); // default to today
      setLoading(false);
    }).catch((err) => {
      console.warn('[FitnessTrendChart] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
      setError(true);
      setLoading(false);
    });
  }, [user?.id]);

  if (loading) {
    return (
      <Card>
        <Text style={styles.title}>Fitness & Fatigue</Text>
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      </Card>
    );
  }

  if (!loading && error && data.length === 0) {
    return (
      <Card>
        <Text style={styles.title}>Fitness & Fatigue</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginVertical: 12 }}>
          Unable to load chart data. Pull down to refresh.
        </Text>
      </Card>
    );
  }

  if (data.length < 2) {
    return (
      <Card>
        <Text style={styles.title}>Fitness & Fatigue</Text>
        <Text style={styles.empty}>Not enough training history yet — keep riding and this fills in.</Text>
      </Card>
    );
  }

  const ctlValues = data.map(d => d.ctl);
  const atlValues = data.map(d => d.atl);
  // Shared Y scale — CTL and ATL are the same units (TSS/day), so they're directly comparable.
  const maxVal = Math.max(...ctlValues, ...atlValues, 1);
  const n = data.length;

  const toX = (i: number) => PAD.left + (n > 1 ? (i / (n - 1)) * IW : IW / 2);
  const toY = (v: number) => PAD.top + (1 - v / maxVal) * IH;

  const ctlPts = ctlValues.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const atlPts = atlValues.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const ctlPath = buildPath(ctlPts);
  const atlPath = buildPath(atlPts);
  const gridYs = [0.25, 0.5, 0.75].map(p => PAD.top + (1 - p) * IH);

  // Sparse x-axis labels — ~5 evenly spaced so they don't overlap on 42 points.
  const labelIdxs = Array.from({ length: 5 }, (_, k) => Math.round((k / 4) * (n - 1)));

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
  const selCtl = Math.round(ctlValues[sel]);
  const selAtl = Math.round(atlValues[sel]);
  const selTsb = Math.round(data[sel].tsb);
  const tsbColor = selTsb > 5 ? '#86efac' : selTsb < -15 ? '#fca5a5' : '#fcd34d';

  return (
    <Card>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Fitness & Fatigue</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: FITNESS_COLOR }]} />
            <Text style={styles.legendText}>Fitness</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: FATIGUE_COLOR }]} />
            <Text style={styles.legendText}>Fatigue</Text>
          </View>
        </View>
      </View>

      {/* Selected day summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#93c5fd' }]}>{selCtl}</Text>
          <Text style={[styles.summaryLabel, { color: '#93c5fd' }]}>Fitness</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: '#fcd34d' }]}>{selAtl}</Text>
          <Text style={[styles.summaryLabel, { color: '#fcd34d' }]}>Fatigue</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: tsbColor }]}>{selTsb > 0 ? `+${selTsb}` : selTsb}</Text>
          <Text style={[styles.summaryLabel, { color: tsbColor }]}>Form</Text>
        </View>
      </View>

      <Pressable onPress={handleTap}>
        <View style={{ width: CHART_W, height: CHART_H + 18 }}>
          <Canvas style={{ width: CHART_W, height: CHART_H }}>
            {gridYs.map((gy, i) => (
              <Path
                key={i}
                path={`M ${PAD.left} ${gy.toFixed(1)} L ${(CHART_W - PAD.right).toFixed(1)} ${gy.toFixed(1)}`}
                color="#1e3a5f"
                style="stroke"
                strokeWidth={1}
              />
            ))}

            <Line
              p1={vec(toX(sel), PAD.top)}
              p2={vec(toX(sel), PAD.top + IH)}
              color="rgba(148, 163, 184, 0.2)"
              strokeWidth={1}
            />

            {atlPath ? <Path path={atlPath} color={FATIGUE_COLOR} style="stroke" strokeWidth={2.5} /> : null}
            {ctlPath ? <Path path={ctlPath} color={FITNESS_COLOR} style="stroke" strokeWidth={2.5} /> : null}

            {/* Only the selected-day markers, to keep 42-point lines clean */}
            <Circle cx={atlPts[sel].x} cy={atlPts[sel].y} r={5} color={FATIGUE_COLOR} />
            <Circle cx={ctlPts[sel].x} cy={ctlPts[sel].y} r={5} color={FITNESS_COLOR} />
          </Canvas>

          {labelIdxs.map((i) => (
            <Text
              key={`xl${i}`}
              style={[styles.xLabel, { left: toX(i) - 16, top: CHART_H + 2 }, i === sel && styles.xLabelSelected]}
            >
              {formatLabel(data[i].date)}
            </Text>
          ))}
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '600', color: '#f1f5f9' },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#94a3b8' },
  summary: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: '#1e293b' },
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#93c5fd' },
  summaryLabel: { fontSize: 10, fontWeight: '500' },
  xLabel: { position: 'absolute', width: 32, textAlign: 'center', fontSize: 9, color: '#64748b' },
  xLabelSelected: { color: '#f1f5f9', fontWeight: '600' },
  empty: { color: '#64748b', fontSize: 14, paddingVertical: 12 },
});
