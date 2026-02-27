import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../stores/useAuthStore';
import { authService } from '../services/authService';
import { stravaService } from '../services/stravaService';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();

  // Profile form state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [ftp, setFtp] = useState(String(user?.ftp || ''));
  const [weightKg, setWeightKg] = useState(String(user?.weight_kg || ''));
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(user?.unit_system || 'metric');
  const [displayMode, setDisplayMode] = useState<'simple' | 'advanced'>(user?.display_mode || 'advanced');
  const [saving, setSaving] = useState(false);

  // Strava
  const [stravaLoading, setStravaLoading] = useState(false);
  const hasStrava = !!user?.strava_athlete_id;

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await authService.updateProfile({
        full_name: fullName.trim() || undefined,
        ftp: ftp ? Number(ftp) : undefined,
        weight_kg: weightKg ? Number(weightKg) : undefined,
        unit_system: unitSystem,
        display_mode: displayMode,
      });
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleConnectStrava = async () => {
    setStravaLoading(true);
    try {
      const authData = await stravaService.getAuthUrl(true);
      const redirectUri = __DEV__
        ? 'exp://localhost:8081/--/strava/callback'
        : 'cyclingcoach://strava/callback';

      const result = await WebBrowser.openAuthSessionAsync(
        (authData as any).auth_url,
        redirectUri
      );

      if (result.type === 'success') {
        const urlStr = result.url;
        const params = new URLSearchParams(urlStr.split('?')[1] || '');
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresAt = params.get('expires_at');
        const athleteId = params.get('athlete_id');

        if (accessToken && refreshToken && expiresAt && athleteId) {
          await stravaService.connectStrava({
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: Number(expiresAt),
            athlete_id: Number(athleteId),
          });
          await authService.getProfile();
          Alert.alert('Connected', 'Strava connected successfully!');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to connect Strava.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleDisconnectStrava = () => {
    Alert.alert('Disconnect Strava', 'Remove Strava connection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await stravaService.disconnectStrava();
          await authService.getProfile();
        },
      },
    ]);
  };

  const handleSyncStrava = async () => {
    setStravaLoading(true);
    try {
      await stravaService.syncActivities();
      Alert.alert('Sync Complete', 'Strava activities synced.');
    } catch {
      Alert.alert('Error', 'Failed to sync activities.');
    } finally {
      setStravaLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Profile Section */}
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.section}>
          <Label>Full Name</Label>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#475569"
          />

          <Label>FTP (watts)</Label>
          <TextInput
            style={styles.input}
            value={ftp}
            onChangeText={setFtp}
            placeholder="250"
            placeholderTextColor="#475569"
            keyboardType="numeric"
          />

          <Label>Weight (kg)</Label>
          <TextInput
            style={styles.input}
            value={weightKg}
            onChangeText={setWeightKg}
            placeholder="70"
            placeholderTextColor="#475569"
            keyboardType="decimal-pad"
          />

          <Label>Unit System</Label>
          <View style={styles.segmented}>
            {(['metric', 'imperial'] as const).map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.seg, unitSystem === u && styles.segActive]}
                onPress={() => setUnitSystem(u)}
              >
                <Text style={[styles.segText, unitSystem === u && styles.segTextActive]}>
                  {u.charAt(0).toUpperCase() + u.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label>Display Mode</Label>
          <View style={styles.segmented}>
            {(['simple', 'advanced'] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.seg, displayMode === m && styles.segActive]}
                onPress={() => setDisplayMode(m)}
              >
                <Text style={[styles.segText, displayMode === m && styles.segTextActive]}>
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.btn, saving && styles.btnDisabled]}
            onPress={handleSaveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.btnText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Strava Section */}
        <Text style={styles.sectionTitle}>Strava</Text>
        <View style={styles.section}>
          {hasStrava ? (
            <>
              <View style={styles.stravaConnected}>
                <View style={styles.stravaStatus}>
                  <View style={styles.statusDot} />
                  <Text style={styles.stravaText}>Connected</Text>
                </View>
                <TouchableOpacity
                  style={[styles.stravaBtn, stravaLoading && styles.btnDisabled]}
                  onPress={handleSyncStrava}
                  disabled={stravaLoading}
                >
                  {stravaLoading ? (
                    <ActivityIndicator size="small" color="#60a5fa" />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={14} color="#60a5fa" />
                      <Text style={styles.stravaBtnText}>Sync</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnectStrava}>
                <Text style={styles.disconnectText}>Disconnect Strava</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: '#e34402' }, stravaLoading && styles.btnDisabled]}
              onPress={handleConnectStrava}
              disabled={stravaLoading}
            >
              {stravaLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnText}>Connect Strava</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
          {user?.subscription_status && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Subscription</Text>
              <Text style={[styles.infoValue, styles.infoValueCapitalize]}>
                {user.subscription_status}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.metricsLink}
            onPress={() => navigation?.navigate?.('Metrics')}
          >
            <Text style={styles.metricsLinkText}>View Detailed Metrics</Text>
            <Ionicons name="chevron-forward" size={16} color="#60a5fa" />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.logoutBtn]} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
    paddingHorizontal: 4,
  },
  section: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94a3b8',
    marginBottom: -4,
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#334155',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 3,
  },
  seg: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 6,
  },
  segActive: { backgroundColor: '#1e3a5f' },
  segText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  segTextActive: { color: '#60a5fa' },
  btn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 13,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  stravaConnected: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stravaStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  stravaText: { color: '#f1f5f9', fontWeight: '500', fontSize: 14 },
  stravaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#1e3a5f',
    borderRadius: 7,
  },
  stravaBtnText: { color: '#60a5fa', fontWeight: '600', fontSize: 13 },
  disconnectBtn: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  disconnectText: { color: '#94a3b8', fontSize: 13 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 14, color: '#94a3b8' },
  infoValue: { fontSize: 14, color: '#f1f5f9', fontWeight: '500' },
  infoValueCapitalize: { textTransform: 'capitalize' },
  metricsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  metricsLinkText: { color: '#60a5fa', fontSize: 14, fontWeight: '500' },
  logoutBtn: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  logoutText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
});
