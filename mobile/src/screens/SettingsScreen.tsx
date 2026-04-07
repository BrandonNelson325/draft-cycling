import React, { useState, useMemo, useEffect } from 'react';
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
  Modal,
  FlatList,
  Image,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useAuthStore } from '../stores/useAuthStore';
import { authService } from '../services/authService';
import { stravaService } from '../services/stravaService';
import { wahooService } from '../services/wahooService';
import { intervalsIcuService } from '../services/intervalsIcuService';
import { subscriptionService } from '../services/subscriptionService';
import { getConversionUtils, convertToMetric } from '../utils/units';
import WelcomeModal from '../components/modals/WelcomeModal';

WebBrowser.maybeCompleteAuthSession();

const ALL_TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone');
  } catch {
    return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];
  }
})();

export default function SettingsScreen({ navigation }: any) {
  const { user, logout } = useAuthStore();
  const units = getConversionUtils(user);

  // Profile form state
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [ftp, setFtp] = useState(String(user?.ftp || ''));
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(user?.unit_system || 'metric');
  // Display weight in the user's preferred unit; store/send as metric
  const [weightDisplay, setWeightDisplay] = useState(() => {
    if (!user?.weight_kg) return '';
    const val = unitSystem === 'imperial' ? user.weight_kg * 2.20462 : user.weight_kg;
    return val.toFixed(1);
  });
  const [maxHr, setMaxHr] = useState(String(user?.max_hr || ''));
  const [restingHr, setRestingHr] = useState(String(user?.resting_hr || ''));
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '');
  const [displayMode, setDisplayMode] = useState<'simple' | 'advanced'>(user?.display_mode || 'advanced');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    user?.experience_level || 'intermediate'
  );
  const [weeklyHours, setWeeklyHours] = useState(String(user?.weekly_training_hours || ''));
  const [timezone, setTimezone] = useState(
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  );
  const [tzPickerVisible, setTzPickerVisible] = useState(false);
  const [tzSearch, setTzSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const filteredTimezones = useMemo(() => {
    if (!tzSearch) return ALL_TIMEZONES;
    const q = tzSearch.toLowerCase();
    return ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(q));
  }, [tzSearch]);

  // Notifications state
  const [pushEnabled, setPushEnabled] = useState(user?.push_notifications_enabled ?? false);
  const [checkinTime, setCheckinTime] = useState(
    user?.morning_checkin_time ? user.morning_checkin_time.slice(0, 5) : '07:00'
  );
  const [savingNotifications, setSavingNotifications] = useState(false);

  const [showDobPicker, setShowDobPicker] = useState(false);

  // App Guide
  const [showGuide, setShowGuide] = useState(false);

  // Strava
  const [stravaLoading, setStravaLoading] = useState(false);
  const hasStrava = !!user?.strava_athlete_id;

  // Wahoo
  const [wahooConnected, setWahooConnected] = useState(false);
  const [wahooLoading, setWahooLoading] = useState(false);
  const [wahooAutoSync, setWahooAutoSync] = useState(false);

  // Intervals.icu
  const [icuConnected, setIcuConnected] = useState(false);
  const [icuLoading, setIcuLoading] = useState(false);
  const [icuAutoSync, setIcuAutoSync] = useState(false);
  const [icuSyncing, setIcuSyncing] = useState(false);

  useEffect(() => {
    wahooService.getStatus().then((status) => {
      setWahooConnected(status.connected);
      setWahooAutoSync(status.auto_sync);
    }).catch(() => {});

    intervalsIcuService.getStatus().then((status) => {
      setIcuConnected(status.connected);
      setIcuAutoSync(status.auto_sync);
    }).catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const weightMetric = weightDisplay
        ? convertToMetric(Number(weightDisplay), unitSystem, 'weight')
        : undefined;
      await authService.updateProfile({
        full_name: fullName.trim() || undefined,
        ftp: ftp ? Number(ftp) : undefined,
        weight_kg: weightMetric ? Math.round(weightMetric * 10) / 10 : undefined,
        unit_system: unitSystem,
        display_mode: displayMode,
        experience_level: experienceLevel,
        weekly_training_hours: weeklyHours ? Number(weeklyHours) : undefined,
        timezone,
        max_hr: maxHr ? Number(maxHr) : undefined,
        resting_hr: restingHr ? Number(restingHr) : undefined,
        date_of_birth: dateOfBirth || undefined,
      });
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch {
      Alert.alert('Error', 'Failed to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePushEnabled = async (value: boolean) => {
    setPushEnabled(value);
    try {
      await authService.updateProfile({ push_notifications_enabled: value });
    } catch {
      Alert.alert('Error', 'Failed to update notification settings.');
      setPushEnabled(!value); // revert
    }
  };

  const handleSaveCheckinTime = async () => {
    // Validate HH:MM format
    const match = checkinTime.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      Alert.alert('Invalid time', 'Please enter a time in HH:MM format (e.g. 07:00).');
      return;
    }
    const hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (hh > 23 || mm > 59) {
      Alert.alert('Invalid time', 'Please enter a valid time (00:00 – 23:59).');
      return;
    }
    const formatted = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    setSavingNotifications(true);
    try {
      const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await authService.updateProfile({ morning_checkin_time: formatted, timezone: deviceTz });
      setCheckinTime(formatted);
      Alert.alert('Saved', 'Morning check-in time updated.');
    } catch {
      Alert.alert('Error', 'Failed to save check-in time.');
    } finally {
      setSavingNotifications(false);
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

  const handleConnectWahoo = async () => {
    setWahooLoading(true);
    try {
      const authUrl = await wahooService.getAuthUrl();
      const redirectUri = __DEV__
        ? 'exp://localhost:8081/--/wahoo/callback'
        : 'cyclingcoach://wahoo/callback';

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success') {
        const urlStr = result.url;
        const params = new URLSearchParams(urlStr.split('?')[1] || '');
        const status = params.get('status');
        if (status === 'connected') {
          setWahooConnected(true);
          Alert.alert('Connected', 'Wahoo connected successfully!');
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to connect Wahoo.');
    } finally {
      setWahooLoading(false);
    }
  };

  const handleDisconnectWahoo = () => {
    Alert.alert('Disconnect Wahoo', 'Remove Wahoo connection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await wahooService.disconnect();
            setWahooConnected(false);
            setWahooAutoSync(false);
          } catch {
            Alert.alert('Error', 'Failed to disconnect Wahoo.');
          }
        },
      },
    ]);
  };

  const handleWahooAutoSyncToggle = async (value: boolean) => {
    setWahooAutoSync(value);
    try {
      await wahooService.updateSettings(value);
    } catch {
      Alert.alert('Error', 'Failed to update Wahoo settings.');
      setWahooAutoSync(!value); // revert
    }
  };

  const handleConnectIntervalsIcu = async () => {
    setIcuLoading(true);
    try {
      const authUrl = await intervalsIcuService.getAuthUrl();
      // Intervals.icu OAuth redirects back to the server which redirects to the app
      const redirectUri = __DEV__
        ? 'exp://localhost:8081/--/intervals-icu/callback'
        : 'cyclingcoach://intervals-icu/callback';

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type === 'success') {
        // Re-check connection status after OAuth
        const status = await intervalsIcuService.getStatus();
        setIcuConnected(status.connected);
        setIcuAutoSync(status.auto_sync);
        if (status.connected) {
          Alert.alert(
            'Connected',
            'Intervals.icu connected! Would you like to sync your existing scheduled workouts?',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Sync now', onPress: handleIcuSyncAll },
            ]
          );
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to connect Intervals.icu.');
    } finally {
      setIcuLoading(false);
    }
  };

  const handleDisconnectIntervalsIcu = () => {
    Alert.alert('Disconnect Intervals.icu', 'Remove Intervals.icu connection? Workouts will no longer sync.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          try {
            await intervalsIcuService.disconnect();
            setIcuConnected(false);
            setIcuAutoSync(false);
          } catch {
            Alert.alert('Error', 'Failed to disconnect Intervals.icu.');
          }
        },
      },
    ]);
  };

  const handleIcuAutoSyncToggle = async (value: boolean) => {
    setIcuAutoSync(value);
    try {
      await intervalsIcuService.updateSettings(value);
    } catch {
      Alert.alert('Error', 'Failed to update Intervals.icu settings.');
      setIcuAutoSync(!value);
    }
  };

  const handleIcuSyncAll = async () => {
    setIcuSyncing(true);
    try {
      const result = await intervalsIcuService.syncAll();
      Alert.alert('Sync Complete', result.message);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to sync workouts.');
    } finally {
      setIcuSyncing(false);
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

          <Label>Weight ({unitSystem === 'imperial' ? 'lbs' : 'kg'})</Label>
          <TextInput
            style={styles.input}
            value={weightDisplay}
            onChangeText={setWeightDisplay}
            placeholder={unitSystem === 'imperial' ? '154' : '70'}
            placeholderTextColor="#475569"
            keyboardType="decimal-pad"
          />

          <Label>Max Heart Rate</Label>
          <TextInput
            style={styles.input}
            value={maxHr}
            onChangeText={setMaxHr}
            placeholder="185"
            placeholderTextColor="#475569"
            keyboardType="numeric"
          />

          <Label>Resting Heart Rate</Label>
          <TextInput
            style={styles.input}
            value={restingHr}
            onChangeText={setRestingHr}
            placeholder="55"
            placeholderTextColor="#475569"
            keyboardType="numeric"
          />

          <Label>Date of Birth</Label>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setShowDobPicker(true)}
          >
            <Text style={{ color: dateOfBirth ? '#f1f5f9' : '#475569', fontSize: 15 }}>
              {dateOfBirth || 'Select date of birth'}
            </Text>
          </TouchableOpacity>
          {showDobPicker && (
            <DateTimePicker
              value={dateOfBirth ? new Date(dateOfBirth + 'T12:00:00') : new Date(1990, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              minimumDate={new Date(1920, 0, 1)}
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') setShowDobPicker(false);
                if (event.type === 'dismissed') return;
                if (selectedDate) {
                  const y = selectedDate.getFullYear();
                  const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
                  const d = String(selectedDate.getDate()).padStart(2, '0');
                  setDateOfBirth(`${y}-${m}-${d}`);
                }
              }}
              themeVariant="dark"
            />
          )}
          {showDobPicker && Platform.OS === 'ios' && (
            <TouchableOpacity onPress={() => setShowDobPicker(false)}>
              <Text style={{ color: '#60a5fa', fontSize: 14, fontWeight: '600', textAlign: 'right', paddingVertical: 4 }}>Done</Text>
            </TouchableOpacity>
          )}

          <Label>Unit System</Label>
          <View style={styles.segmented}>
            {(['metric', 'imperial'] as const).map(u => (
              <TouchableOpacity
                key={u}
                style={[styles.seg, unitSystem === u && styles.segActive]}
                onPress={() => {
                  if (u === unitSystem) return;
                  // Re-convert the displayed weight when switching units
                  if (weightDisplay) {
                    const currentVal = Number(weightDisplay);
                    if (!isNaN(currentVal)) {
                      const converted = u === 'imperial'
                        ? currentVal * 2.20462  // kg → lbs
                        : currentVal / 2.20462; // lbs → kg
                      setWeightDisplay(converted.toFixed(1));
                    }
                  }
                  setUnitSystem(u);
                }}
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

          <Label>Experience Level</Label>
          <Text style={styles.hint}>How long you've been doing structured training</Text>
          <View style={styles.segmented}>
            {(['beginner', 'intermediate', 'advanced'] as const).map(lv => (
              <TouchableOpacity
                key={lv}
                style={[styles.seg, experienceLevel === lv && styles.segActive]}
                onPress={() => setExperienceLevel(lv)}
              >
                <Text style={[styles.segText, experienceLevel === lv && styles.segTextActive]}>
                  {lv.charAt(0).toUpperCase() + lv.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label>Weekly Training Hours</Label>
          <Text style={styles.hint}>Hours per week you can commit to riding</Text>
          <TextInput
            style={styles.input}
            value={weeklyHours}
            onChangeText={setWeeklyHours}
            placeholder="e.g. 8"
            placeholderTextColor="#475569"
            keyboardType="decimal-pad"
          />

          <Label>Timezone</Label>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setTzPickerVisible(true)}
          >
            <Text style={{ color: '#f1f5f9', fontSize: 15 }}>{timezone.replace(/_/g, ' ')}</Text>
          </TouchableOpacity>

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
        <View style={styles.stravaTitleRow}>
          <Image source={require('../../assets/strava-logo.png')} style={{ width: 18, height: 18 }} resizeMode="contain" />
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Strava</Text>
        </View>
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

        {/* Intervals.icu Section */}
        <View style={styles.stravaTitleRow}>
          <Ionicons name="calendar-outline" size={18} color="#60a5fa" />
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Intervals.icu</Text>
        </View>
        <View style={styles.section}>
          {icuConnected ? (
            <>
              <View style={styles.stravaConnected}>
                <View style={styles.stravaStatus}>
                  <View style={styles.statusDot} />
                  <Text style={styles.stravaText}>Connected</Text>
                </View>
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 17, marginBottom: 4 }}>
                Workouts sync to your head unit (Garmin, Wahoo, and more) and training platforms (Zwift, Rouvy, and more) via Intervals.icu. Connect your devices in your Intervals.icu settings.
              </Text>
              <View style={styles.notifRow}>
                <View>
                  <Text style={styles.notifLabel}>Auto-sync workouts</Text>
                  <Text style={styles.notifHint}>Push planned workouts to Intervals.icu</Text>
                </View>
                <Switch
                  value={icuAutoSync}
                  onValueChange={handleIcuAutoSyncToggle}
                  trackColor={{ false: '#334155', true: '#3b82f6' }}
                  thumbColor="#fff"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  style={[styles.stravaBtn, icuSyncing && styles.btnDisabled]}
                  onPress={handleIcuSyncAll}
                  disabled={icuSyncing}
                >
                  {icuSyncing ? (
                    <ActivityIndicator size="small" color="#60a5fa" />
                  ) : (
                    <>
                      <Ionicons name="sync-outline" size={14} color="#60a5fa" />
                      <Text style={styles.stravaBtnText}>Sync All</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.stravaBtn, { borderColor: '#ef4444' }]}
                  onPress={handleDisconnectIntervalsIcu}
                >
                  <Text style={[styles.stravaBtnText, { color: '#ef4444' }]}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: '#1d4ed8' }, icuLoading && styles.btnDisabled]}
                onPress={handleConnectIntervalsIcu}
                disabled={icuLoading}
              >
                {icuLoading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnText}>Connect Intervals.icu</Text>
                )}
              </TouchableOpacity>
              <Text style={{ color: '#64748b', fontSize: 11, marginTop: 8, lineHeight: 16 }}>
                Sync workouts to your head unit (Garmin, Wahoo, and more) or training platform (Zwift, Rouvy, and more). Create a free account at intervals.icu, then connect your devices there. Workouts will automatically sync to all connected devices.
              </Text>
            </>
          )}
        </View>

        {/* Wahoo Section */}
        <View style={styles.stravaTitleRow}>
          <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: '#1d4ed8', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>W</Text>
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Wahoo</Text>
        </View>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#334155', opacity: 0.6 }]}
            disabled={true}
          >
            <Text style={styles.btnText}>Connect Wahoo</Text>
          </TouchableOpacity>
          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 6, lineHeight: 16 }}>Coming soon — connect to Intervals.icu above to sync workouts to your Wahoo head unit now.</Text>
        </View>

        {/* Garmin Section */}
        <View style={styles.stravaTitleRow}>
          <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>G</Text>
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Garmin</Text>
        </View>
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: '#334155', opacity: 0.6 }]}
            disabled={true}
          >
            <Text style={styles.btnText}>Connect Garmin</Text>
          </TouchableOpacity>
          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 6, lineHeight: 16 }}>Coming soon — connect to Intervals.icu above to sync workouts to your Garmin device now.</Text>
        </View>

        {/* Notifications Section */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <View style={styles.section}>
          <View style={styles.notifRow}>
            <View>
              <Text style={styles.notifLabel}>Push Notifications</Text>
              <Text style={styles.notifHint}>Ride sync alerts &amp; morning check-in</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={handleTogglePushEnabled}
              trackColor={{ false: '#334155', true: '#3b82f6' }}
              thumbColor="#fff"
            />
          </View>

          <Label>Morning Check-in Time (HH:MM)</Label>
          <View style={styles.timeRow}>
            <TextInput
              style={[styles.input, styles.timeInput]}
              value={checkinTime}
              onChangeText={setCheckinTime}
              placeholder="07:00"
              placeholderTextColor="#475569"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
            <TouchableOpacity
              style={[styles.timeBtn, savingNotifications && styles.btnDisabled]}
              onPress={handleSaveCheckinTime}
              disabled={savingNotifications}
            >
              {savingNotifications ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Account Section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.section}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
          {(user?.subscription_status || user?.beta_access_code) && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Access</Text>
              <Text style={[styles.infoValue, styles.infoValueCapitalize]}>
                {user?.beta_access_code ? 'Beta' : user?.subscription_status}
              </Text>
            </View>
          )}
          {(user?.subscription_status === 'active' || user?.subscription_status === 'trialing') && (
            <TouchableOpacity
              style={styles.guideBtn}
              onPress={async () => {
                try {
                  const url = await subscriptionService.createPortal();
                  await WebBrowser.openBrowserAsync(url);
                } catch {
                  Alert.alert('Error', 'Failed to open subscription management.');
                }
              }}
            >
              <Ionicons name="card-outline" size={16} color="#60a5fa" />
              <Text style={styles.guideBtnText}>Manage Subscription</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.metricsLink}
            onPress={() => navigation?.navigate?.('Metrics')}
          >
            <Text style={styles.metricsLinkText}>View Detailed Metrics</Text>
            <Ionicons name="chevron-forward" size={16} color="#60a5fa" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.guideBtn} onPress={() => setShowGuide(true)}>
            <Ionicons name="book-outline" size={16} color="#60a5fa" />
            <Text style={styles.guideBtnText}>App Guide</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.btn, styles.logoutBtn]} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>

      <Modal visible={tzPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
            <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '600' }}>Select Timezone</Text>
            <TouchableOpacity onPress={() => { setTzPickerVisible(false); setTzSearch(''); }}>
              <Text style={{ color: '#60a5fa', fontSize: 16 }}>Done</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[styles.input, { margin: 16, marginBottom: 8 }]}
            value={tzSearch}
            onChangeText={setTzSearch}
            placeholder="Search timezones..."
            placeholderTextColor="#64748b"
            autoFocus
          />
          <FlatList
            data={filteredTimezones}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ padding: 14, paddingHorizontal: 16, backgroundColor: item === timezone ? '#1e3a5f' : 'transparent' }}
                onPress={() => { setTimezone(item); setTzPickerVisible(false); setTzSearch(''); }}
              >
                <Text style={{ color: item === timezone ? '#60a5fa' : '#f1f5f9', fontSize: 15 }}>
                  {item.replace(/_/g, ' ')}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <WelcomeModal
        visible={showGuide}
        onClose={() => setShowGuide(false)}
        showWelcome={false}
      />
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
  hint: {
    fontSize: 11,
    color: '#64748b',
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
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    padding: 13,
  },
  guideBtnText: { color: '#60a5fa', fontWeight: '600', fontSize: 14 },
  stravaTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  logoutBtn: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
  logoutText: { color: '#ef4444', fontWeight: '600', fontSize: 14 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  notifLabel: { fontSize: 14, color: '#f1f5f9', fontWeight: '500' },
  notifHint: { fontSize: 12, color: '#64748b', marginTop: 2 },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeInput: { flex: 1 },
  timeBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
