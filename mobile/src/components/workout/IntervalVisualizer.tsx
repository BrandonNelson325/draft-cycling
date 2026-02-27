import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import type { WorkoutInterval } from '../../services/workoutService';

const { width } = Dimensions.get('window');
const VIZ_WIDTH = width - 64;
const BAR_HEIGHT = 72;

const ZONE_COLORS: Record<string, string> = {
  Z1: '#6b7280',
  Z2: '#3b82f6',
  Z3: '#22c55e',
  Z4: '#eab308',
  Z5: '#f97316',
  Z6: '#ef4444',
};

function getZone(power?: number): string {
  if (!power) return 'Z1';
  if (power < 56) return 'Z1';
  if (power < 76) return 'Z2';
  if (power < 91) return 'Z3';
  if (power < 106) return 'Z4';
  if (power < 121) return 'Z5';
  return 'Z6';
}

function getPower(interval: WorkoutInterval): number {
  return interval.power || interval.power_high || interval.power_low || 0;
}

interface IntervalVisualizerProps {
  intervals: WorkoutInterval[];
}

export default function IntervalVisualizer({ intervals }: IntervalVisualizerProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Expand repeats
  const expanded: WorkoutInterval[] = [];
  for (const interval of intervals) {
    const count = interval.repeat || 1;
    for (let i = 0; i < count; i++) {
      expanded.push(interval);
    }
  }

  const totalDuration = expanded.reduce((sum, iv) => sum + iv.duration, 0);
  if (!totalDuration) return null;

  const selected = selectedIndex !== null ? expanded[selectedIndex] : null;

  return (
    <View style={styles.container}>
      {/* Bar visualization */}
      <View style={[styles.bars, { height: BAR_HEIGHT }]}>
        {expanded.map((iv, i) => {
          const power = getPower(iv);
          const zone = getZone(power);
          const color = ZONE_COLORS[zone] || '#6b7280';
          const widthPct = (iv.duration / totalDuration) * 100;
          // Height proportional to power (50-120% FTP range)
          const heightPct = power > 0 ? Math.min(1, Math.max(0.1, power / 130)) : 0.12;
          const barH = Math.round(heightPct * BAR_HEIGHT);

          return (
            <TouchableOpacity
              key={i}
              onPress={() => setSelectedIndex(i === selectedIndex ? null : i)}
              activeOpacity={0.7}
              style={[
                styles.bar,
                {
                  width: `${widthPct}%`,
                  height: barH,
                  backgroundColor: color,
                  opacity: selectedIndex !== null && selectedIndex !== i ? 0.5 : 1,
                  borderWidth: selectedIndex === i ? 2 : 0,
                  borderColor: '#fff',
                },
              ]}
            />
          );
        })}
      </View>

      {/* Zone legend */}
      <View style={styles.legend}>
        {Object.entries(ZONE_COLORS).map(([zone, color]) => (
          <View key={zone} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={styles.legendText}>{zone}</Text>
          </View>
        ))}
      </View>

      {/* Selected interval detail */}
      {selected && (
        <View style={styles.detail}>
          <Text style={styles.detailText}>
            {Math.round(selected.duration / 60)}:{String(selected.duration % 60).padStart(2, '0')}
            {getPower(selected) > 0 ? ` · ${getPower(selected)}% FTP (${getZone(getPower(selected))})` : ''}
            {selected.type ? ` · ${selected.type}` : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    overflow: 'hidden',
    borderRadius: 4,
  },
  bar: {
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#64748b',
  },
  detail: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#94a3b8',
  },
});
