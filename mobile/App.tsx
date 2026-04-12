import 'react-native-gesture-handler';
import React, { useState, useEffect, useCallback } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import DailyMorningModal from './src/components/modals/DailyMorningModal';
import PostRideModal from './src/components/modals/PostRideModal';
import WelcomeModal from './src/components/modals/WelcomeModal';
import { useDailyMorning } from './src/hooks/useDailyMorning';
import { useNewActivities } from './src/hooks/useNewActivities';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { useTokenRefresh } from './src/hooks/useTokenRefresh';
import { useAuthStore } from './src/stores/useAuthStore';
import ConnectionBanner from './src/components/ui/ConnectionBanner';

const linking = {
  prefixes: ['cyclingcoach://', 'exp://'],
  config: {
    screens: {
      StravaCallback: 'strava/callback',
      SubscriptionCallback: 'subscription/:status',
    },
  },
};

/**
 * Gate: only mount AppModalsInner (and its data-fetching hooks) after
 * the user has passed the subscription/beta gate. This prevents API
 * calls like /daily-check-in/readiness from firing during registration.
 */
function AppModals() {
  const { user } = useAuthStore();

  const hasBetaOrSubscription =
    !!user?.beta_access_code ||
    user?.subscription_status === 'active' ||
    user?.subscription_status === 'trialing';

  if (!user || !hasBetaOrSubscription) return null;

  return <AppModalsInner />;
}

function AppModalsInner() {
  const { user } = useAuthStore();
  const dailyMorning = useDailyMorning();
  const newActivities = useNewActivities();
  usePushNotifications(newActivities.refetch, dailyMorning.forceShow);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (user) {
      AsyncStorage.getItem(`welcome_shown_${user.id}`).then((val) => {
        if (!val) setShowWelcome(true);
      });
    }
  }, [user]);

  const dismissWelcome = async () => {
    if (user) {
      await AsyncStorage.setItem(`welcome_shown_${user.id}`, 'true');
    }
    setShowWelcome(false);
  };

  const currentActivity = newActivities.activities[newActivities.currentIndex];
  const showPostRide = !dailyMorning.shouldShow && !showWelcome && !!currentActivity;

  const navigateToChat = useCallback((message: string) => {
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('Main', { screen: 'Chat', params: { initialMessage: message } });
    }
  }, []);

  return (
    <>
      <WelcomeModal
        visible={showWelcome}
        onClose={dismissWelcome}
        showWelcome={true}
      />
      <DailyMorningModal
        visible={!showWelcome && dailyMorning.shouldShow}
        analysis={dailyMorning.analysis}
        readiness={dailyMorning.readiness}
        onDismiss={dailyMorning.dismiss}
      />
      <PostRideModal
        activity={showPostRide ? currentActivity : null}
        onAcknowledge={newActivities.acknowledge}
        onSkip={newActivities.skip}
        onNavigateToChat={navigateToChat}
      />
    </>
  );
}

function TokenRefreshGate() {
  useTokenRefresh();
  return null;
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <NavigationContainer ref={navigationRef} linking={linking}>
            <StatusBar style="light" />
            <ConnectionBanner />
            <TokenRefreshGate />
            <RootNavigator />
            <AppModals />
          </NavigationContainer>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
