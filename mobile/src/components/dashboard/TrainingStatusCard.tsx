import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Card from '../ui/Card';
import FreshnessGauge from './FreshnessGauge';
import { trainingService } from '../../services/trainingService';

export default function TrainingStatusCard() {
  const [status, setStatus] = useState<{ ctl: number; atl: number; tsb: number; form_status: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    trainingService.getTrainingStatus().then(s => {
      setStatus(s);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  return (
    <Card>
      <Text style={styles.title}>Training Status</Text>
      {loading ? (
        <ActivityIndicator color="#3b82f6" style={{ marginVertical: 16 }} />
      ) : status ? (
        <FreshnessGauge tsb={status.tsb} ctl={status.ctl} atl={status.atl} />
      ) : (
        <Text style={styles.empty}>No training data yet. Sync your Strava activities.</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f1f5f9',
    marginBottom: 16,
  },
  empty: {
    color: '#64748b',
    fontSize: 14,
    lineHeight: 20,
  },
});
