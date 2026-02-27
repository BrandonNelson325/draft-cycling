import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import Card from '../ui/Card';
import { ftpService } from '../../services/ftpService';
import { authService } from '../../services/authService';

export default function FTPEstimateCard() {
  const [estimate, setEstimate] = useState<{ estimated_ftp: number; confidence: number; based_on_rides: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    ftpService.getEstimate().then(e => {
      setEstimate(e);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleAccept = async () => {
    if (!estimate) return;
    setAccepting(true);
    try {
      await authService.updateProfile({ ftp: estimate.estimated_ftp });
      Alert.alert('FTP Updated', `Your FTP has been set to ${estimate.estimated_ftp}W.`);
    } catch {
      Alert.alert('Error', 'Failed to update FTP.');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <Text style={styles.title}>FTP Estimate</Text>
        <ActivityIndicator color="#3b82f6" />
      </Card>
    );
  }

  if (!estimate) return null;

  return (
    <Card>
      <Text style={styles.title}>FTP Estimate</Text>
      <View style={styles.row}>
        <View>
          <Text style={styles.ftpValue}>{estimate.estimated_ftp}W</Text>
          <Text style={styles.meta}>
            Based on {estimate.based_on_rides} rides · {Math.round(estimate.confidence * 100)}% confidence
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.button, accepting && styles.buttonDisabled]}
          onPress={handleAccept}
          disabled={accepting}
        >
          {accepting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Accept</Text>
          )}
        </TouchableOpacity>
      </View>
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
    justifyContent: 'space-between',
  },
  ftpValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  meta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
