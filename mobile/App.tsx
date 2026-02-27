import 'react-native-gesture-handler';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import RootNavigator from './src/navigation/RootNavigator';
import DailyMorningModal from './src/components/modals/DailyMorningModal';
import PostRideModal from './src/components/modals/PostRideModal';
import { useDailyMorning } from './src/hooks/useDailyMorning';
import { useNewActivities } from './src/hooks/useNewActivities';
import { useAuthStore } from './src/stores/useAuthStore';

const linking = {
  prefixes: ['cyclingcoach://', 'exp://'],
  config: {
    screens: {
      StravaCallback: 'strava/callback',
    },
  },
};

function AppModals() {
  const { user } = useAuthStore();
  const dailyMorning = useDailyMorning();
  const newActivities = useNewActivities();

  const currentActivity = newActivities.activities[newActivities.currentIndex];
  const showPostRide = !dailyMorning.shouldShow && !!currentActivity;

  if (!user) return null;

  return (
    <>
      <DailyMorningModal
        visible={dailyMorning.shouldShow}
        analysis={dailyMorning.analysis}
        readiness={dailyMorning.readiness}
        onDismiss={dailyMorning.dismiss}
      />
      <PostRideModal
        activity={showPostRide ? currentActivity : null}
        onAcknowledge={newActivities.acknowledge}
        onSkip={newActivities.skip}
      />
    </>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <NavigationContainer linking={linking}>
            <StatusBar style="light" />
            <RootNavigator />
            <AppModals />
          </NavigationContainer>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
