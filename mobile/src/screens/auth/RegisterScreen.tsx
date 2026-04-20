import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { authService } from '../../services/authService';
import type { AuthStackScreenProps } from '../../navigation/types';

const ALL_TIMEZONES: string[] = (() => {
  try {
    return (Intl as any).supportedValuesOf('timeZone');
  } catch {
    return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];
  }
})();

export default function RegisterScreen({ navigation }: AuthStackScreenProps<'Register'>) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  );
  const [tzPickerVisible, setTzPickerVisible] = useState(false);
  const [tzSearch, setTzSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const filteredTimezones = useMemo(() => {
    if (!tzSearch) return ALL_TIMEZONES;
    const q = tzSearch.toLowerCase();
    return ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(q));
  }, [tzSearch]);

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please fill in all required fields.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await authService.register(email.trim().toLowerCase(), password, fullName.trim() || undefined, timezone);
    } catch (err: any) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        'Please try again.';
      Alert.alert('Registration Failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Start your cycling journey</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Full Name (optional)</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            placeholderTextColor="#64748b"
            autoComplete="name"
            returnKeyType="next"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#64748b"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor="#64748b"
            secureTextEntry
            returnKeyType="next"
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat password"
            placeholderTextColor="#64748b"
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <Text style={styles.label}>Timezone</Text>
          <TouchableOpacity
            style={styles.input}
            onPress={() => setTzPickerVisible(true)}
          >
            <Text style={{ color: '#f1f5f9', fontSize: 16 }}>{timezone.replace(/_/g, ' ')}</Text>
          </TouchableOpacity>

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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.link}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  form: {
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#cbd5e1',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#f1f5f9',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    alignItems: 'center',
    marginTop: 16,
  },
  linkText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  linkBold: {
    color: '#60a5fa',
    fontWeight: '600',
  },
});
