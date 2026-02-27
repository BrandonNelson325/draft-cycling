import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Card from '../ui/Card';
import { stravaService } from '../../services/stravaService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';
import { parseLocalDate } from '../../utils/date';

export default function RecentActivities() {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const units = getConversionUtils(user);

  useEffect(() => {
    stravaService.getActivities().then((data: any) => {
      const list = Array.isArray(data) ? data : data?.activities || [];
      setActivities(list.slice(0, 5));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <Card>
      <Text style={styles.title}>Recent Activities</Text>
      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 8 }} />
      ) : activities.length === 0 ? (
        <Text style={styles.empty}>No activities yet. Connect Strava to sync rides.</Text>
      ) : (
        activities.map((activity, i) => {
          const dist = activity.distance_meters
            ? `${units.formatDistance(activity.distance_meters)} ${units.distanceUnitShort}`
            : null;
          const time = activity.moving_time_seconds
            ? `${Math.round(activity.moving_time_seconds / 60)}min`
            : null;
          const date = activity.start_date
            ? parseLocalDate(activity.start_date.slice(0, 10)).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })
            : '';

          return (
            <View key={activity.id || i} style={[styles.row, i > 0 && styles.rowBorder]}>
              <View style={styles.dot} />
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>
                  {activity.name || 'Ride'}
                </Text>
                <Text style={styles.meta}>
                  {[date, dist, time, activity.tss ? `TSS ${Math.round(activity.tss)}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {activity.average_watts ? (
                <Text style={styles.watts}>{Math.round(activity.average_watts)}w</Text>
              ) : null}
            </View>
          );
        })
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  rowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f97316',
    flexShrink: 0,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: '500',
    color: '#f1f5f9',
  },
  meta: {
    fontSize: 12,
    color: '#64748b',
  },
  watts: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
});
