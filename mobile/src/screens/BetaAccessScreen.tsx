import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { betaService } from '../services/betaService';
import { authService } from '../services/authService';
import { useAuthStore } from '../stores/useAuthStore';

export default function BetaAccessScreen() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { logout } = useAuthStore();

  const handleActivate = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Please enter a beta access code.');
      return;
    }

    setLoading(true);
    try {
      await betaService.activateBetaAccess(code.trim());
      await authService.getProfile(); // Refresh user profile
    } catch (err: any) {
      Alert.alert('Invalid Code', err.message || 'That code is not valid. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Beta Access Required</Text>
      <Text style={styles.subtitle}>
        Enter your beta access code to continue using Cycling Coach.
      </Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="BETA-XXXX"
        placeholderTextColor="#64748b"
        autoCapitalize="characters"
        returnKeyType="done"
        onSubmitEditing={handleActivate}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleActivate}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Activate</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutLink} onPress={logout}>
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
    color: '#f1f5f9',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutLink: {
    alignItems: 'center',
    marginTop: 24,
  },
  logoutText: {
    color: '#64748b',
    fontSize: 14,
  },
});
