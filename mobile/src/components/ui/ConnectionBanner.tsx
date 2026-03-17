import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function ConnectionBanner() {
  const [connected, setConnected] = useState(true);

  const checkConnection = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  };

  useEffect(() => {
    checkConnection();

    // Re-check on app foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkConnection();
    });

    return () => sub.remove();
  }, []);

  // When disconnected, poll every 10 seconds to detect recovery
  useEffect(() => {
    if (connected) return;
    const retry = setInterval(checkConnection, 10000);
    return () => clearInterval(retry);
  }, [connected]);

  if (connected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No connection to server. Retrying...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#dc2626',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
