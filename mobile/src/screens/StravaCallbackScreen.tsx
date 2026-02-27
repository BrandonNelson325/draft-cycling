import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { RootStackScreenProps } from '../navigation/types';

export default function StravaCallbackScreen({ route, navigation }: RootStackScreenProps<'StravaCallback'>) {
  useEffect(() => {
    // The actual token exchange happens in StravaCard via WebBrowser result
    // This screen is just a deep-link landing page
    const timer = setTimeout(() => navigation.goBack(), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.text}>Connecting Strava...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  text: {
    color: '#94a3b8',
    fontSize: 16,
  },
});
