import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../stores/useAuthStore';
import type { RootStackParamList } from './types';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import BetaAccessScreen from '../screens/BetaAccessScreen';
import StravaCallbackScreen from '../screens/StravaCallbackScreen';
import MainTabNavigator from './MainTabNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AuthStackNav = createNativeStackNavigator();

function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen as any} />
      <AuthStackNav.Screen name="Register" component={RegisterScreen as any} />
    </AuthStackNav.Navigator>
  );
}

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const hydrated = useAuthStore((s) => s.hydrated);

  // Wait for SecureStore to rehydrate before rendering
  if (!hydrated) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  const hasBetaOrSubscription =
    !!user?.beta_access_code ||
    user?.subscription_status === 'active' ||
    user?.subscription_status === 'trialing';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Auth" component={AuthStack} />
      ) : !hasBetaOrSubscription ? (
        <Stack.Screen name="BetaAccess" component={BetaAccessScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainTabNavigator} />
      )}
      <Stack.Screen
        name="StravaCallback"
        component={StravaCallbackScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
