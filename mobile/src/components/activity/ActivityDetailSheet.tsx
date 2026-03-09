import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { StravaActivity } from '../../services/calendarService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';
import Badge from '../ui/Badge';

interface ActivityDetailSheetProps {
  activity: StravaActivity | null;
}

const TYPE_COLORS: Record<string, string> = {
  Ride: '#1e3a5f',
  VirtualRide: '#2a1040',
  Run: '#1e3a1f',
};

const TYPE_TEXT: Record<string, string> = {
  Ride: '#60a5fa',
  VirtualRide: '#c084fc',
  Run: '#4ade80',
};

const RPE_DISPLAY: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '😴', label: 'Very Easy' },
  2: { emoji: '🙂', label: 'Easy' },
  3: { emoji: '😤', label: 'Moderate' },
  4: { emoji: '💪', label: 'Hard' },
  5: { emoji: '🔥', label: 'Max' },
};

export default function ActivityDetailSheet({ activity }: ActivityDetailSheetProps) {
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  if (!activity) return null;

  const duration = activity.moving_time_seconds
    ? `${Math.floor(activity.moving_time_seconds / 3600)}h ${Math.round((activity.moving_time_seconds % 3600) / 60)}m`
    : null;

  const secondaryStats: { label: string; value: string }[] = [];

  if (activity.total_elevation_gain) {
    secondaryStats.push({
      label: `Elevation (${units.elevationUnitShort})`,
      value: units.formatElevation(activity.total_elevation_gain),
    });
  }
  if (activity.average_heartrate) {
    secondaryStats.push({
      label: 'Avg HR',
      value: `${Math.round(activity.average_heartrate)} bpm`,
    });
  }
  if (activity.max_heartrate) {
    secondaryStats.push({
      label: 'Max HR',
      value: `${Math.round(activity.max_heartrate)} bpm`,
    });
  }
  if (activity.max_watts) {
    secondaryStats.push({
      label: 'Max Power',
      value: `${Math.round(activity.max_watts)}w`,
    });
  }
  if (activity.weighted_average_watts) {
    secondaryStats.push({
      label: 'NP',
      value: `${Math.round(activity.weighted_average_watts)}w`,
    });
  }
  if (activity.intensity_factor) {
    secondaryStats.push({
      label: 'IF',
      value: activity.intensity_factor.toFixed(2),
    });
  }
  if (activity.calories) {
    secondaryStats.push({
      label: 'Calories',
      value: `${Math.round(activity.calories)}`,
    });
  }

  return (
    <BottomSheetScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.name}>{activity.name || 'Ride'}</Text>
        <Badge
          label={activity.type === 'VirtualRide' ? 'Virtual' : activity.type}
          color={TYPE_COLORS[activity.type] || '#1e293b'}
          textColor={TYPE_TEXT[activity.type] || '#94a3b8'}
        />
      </View>

      <View style={styles.primaryStats}>
        {activity.distance_meters > 0 && (
          <StatItem
            label={units.distanceUnitShort}
            value={units.formatDistance(activity.distance_meters)}
          />
        )}
        {duration && <StatItem label="Duration" value={duration} />}
        {activity.average_watts && (
          <StatItem label="Avg Power" value={`${Math.round(activity.average_watts)}w`} />
        )}
        {activity.tss && (
          <StatItem label="TSS" value={`${Math.round(activity.tss)}`} />
        )}
      </View>

      {secondaryStats.length > 0 && (
        <View style={styles.secondaryGrid}>
          {secondaryStats.map((s) => (
            <View key={s.label} style={styles.secondaryItem}>
              <Text style={styles.secondaryValue}>{s.value}</Text>
              <Text style={styles.secondaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {activity.perceived_effort && RPE_DISPLAY[activity.perceived_effort] && (
        <View style={styles.rpeSection}>
          <Text style={styles.rpeEmoji}>{RPE_DISPLAY[activity.perceived_effort].emoji}</Text>
          <View>
            <Text style={styles.rpeLabel}>Perceived Effort</Text>
            <Text style={styles.rpeValue}>{RPE_DISPLAY[activity.perceived_effort].label}</Text>
          </View>
        </View>
      )}

      {activity.post_activity_notes ? (
        <View style={styles.notesSection}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{activity.post_activity_notes}</Text>
        </View>
      ) : null}
    </BottomSheetScrollView>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  primaryStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  statLabel: { fontSize: 11, color: '#64748b' },
  secondaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  secondaryItem: {
    width: '46%',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  secondaryValue: { fontSize: 16, fontWeight: '600', color: '#f1f5f9' },
  secondaryLabel: { fontSize: 11, color: '#64748b' },
  rpeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
  },
  rpeEmoji: { fontSize: 28 },
  rpeLabel: { fontSize: 11, color: '#64748b' },
  rpeValue: { fontSize: 15, fontWeight: '600', color: '#f1f5f9' },
  notesSection: {
    marginTop: 12,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  notesLabel: { fontSize: 11, color: '#64748b' },
  notesText: { fontSize: 14, color: '#f1f5f9', lineHeight: 20 },
});
