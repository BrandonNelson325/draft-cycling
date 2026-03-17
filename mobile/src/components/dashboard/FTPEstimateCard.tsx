import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import Card from '../ui/Card';
import { ftpService } from '../../services/ftpService';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';

export default function FTPEstimateCard() {
  const user = useAuthStore((s) => s.user);
  const units = getConversionUtils(user);
  const [estimate, setEstimate] = useState<{ estimated_ftp: number; confidence: number; based_on_rides: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    // Refresh user profile first to get current FTP (may have been auto-updated by backend)
    authService.getProfile().catch(() => {}).then(() =>
      ftpService.getEstimate().then(e => {
        setEstimate(e);
        setLoading(false);
      }).catch(() => { setError(true); setLoading(false); })
    );
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

  if (!estimate && !error) return null;
  if (error) {
    return (
      <Card>
        <Text style={styles.title}>FTP Estimate</Text>
        <Text style={{ color: '#ef4444', fontSize: 13 }}>
          Unable to load FTP estimate.
        </Text>
      </Card>
    );
  }

  const currentFtp = user?.ftp;
  const weightKg = user?.weight_kg;
  const ftpMatches = Number(currentFtp) === Number(estimate.estimated_ftp);
  const displayFtp = ftpMatches ? currentFtp : estimate.estimated_ftp;
  const wPerKg = currentFtp && weightKg ? (currentFtp / weightKg).toFixed(2) : null;

  return (
    <Card>
      <Text style={styles.title}>{ftpMatches ? 'Current FTP' : 'FTP Estimate'}</Text>
      <View style={styles.row}>
        <View>
          <Text style={styles.ftpValue}>{displayFtp}W</Text>
          <Text style={styles.meta}>
            Based on {estimate.based_on_rides} rides · {Math.round(estimate.confidence * 100)}% confidence
          </Text>
        </View>
        {!ftpMatches && (
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
        )}
      </View>

      <View style={styles.divider} />

      <View style={styles.statsRow}>
        {!ftpMatches && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Current FTP</Text>
            <Text style={styles.statValue}>{currentFtp ? `${currentFtp}W` : '—'}</Text>
          </View>
        )}
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Weight</Text>
          <Text style={styles.statValue}>
            {weightKg ? `${units.formatWeight(weightKg)} ${units.weightUnitShort}` : '—'}
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>W/kg</Text>
          <Text style={styles.statValue}>{wPerKg ? `${wPerKg}` : '—'}</Text>
        </View>
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
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
});
