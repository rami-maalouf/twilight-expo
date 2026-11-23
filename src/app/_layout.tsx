import { Redirect, Stack } from 'expo-router';
import { Observe, ObserveRoot } from 'expo-observe';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { settingsStore } from '@/data/app-db';
import { AppAlertHost } from '@/components/common/AppAlertHost';
import { AppCrashFallback } from '@/components/common/AppCrashFallback';
import { DemoExitControl } from '@/components/demo/DemoExitControl';
import { isDemoMode } from '@/demo/demo-mode';
import { HomeWidgetSync } from '@/components/widgets/HomeWidgetSync';
import { useHealthConnectSync } from '@/services/health-connect/use-health-connect-sync';
import { configureForegroundNotifications, updateWindDownNotification } from '@/services/notifications';
import { useForegroundRefresh } from '@/services/use-foreground-refresh';
import { useLiveActivitySync } from '@/services/use-live-activity-sync';
import { useExternalSleepActions } from '@/services/use-external-sleep-actions';
import { useRatingPrompt } from '@/services/use-rating-prompt';
import { useSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

configureForegroundNotifications();

// expo observe: startup, per-route and error reporting. one configure call for
// the whole app (each call replaces the last), before any screen mounts. demo
// builds run on seeded data, so their numbers stay out of production's
Observe.configure({
  integrations: { 'expo-router': true },
  ...(isDemoMode ? { environment: 'demo' } : {}),
});

// material 3 bottom sheets use 28dp top corners; ios keeps the system sheet
const ANDROID_SHEET = Platform.OS === 'android' ? { sheetCornerRadius: 28 } : {};

function ThemedStatusBar() {
  const theme = useTheme();
  const isLight = theme.name === 'sunset';
  return (
    <StatusBar style={isLight ? 'dark' : 'light'} />
  );
}

function RootLayout() {
  // the original applies .grayscale(1.0) on the app root while sleeping;
  // the port swaps in the desaturated palette (spike 3 decision)
  const isSleeping = useSleepStore((s) => s.activeSession != null);
  // onboarding gate: fresh installs land in the 4-step flow
  const isOnboarded = useSettings((s) => s.isOnboarded);

  // live activity lifecycle (parity + superpower wiring)
  useLiveActivitySync();
  // start/stop from home widgets and twilight://sleep links
  useExternalSleepActions();
  // reread sessions and settings on every return to the foreground
  useForegroundRefresh();
  // health connect two-way sleep sync triggers (android only)
  useHealthConnectSync();
  // review prompt from the third launch, once per version
  useRatingPrompt();

  // wind-down reminder: (re)schedule on launch, bedtime change, and toggle
  const windDownEnabled = useSettings((s) => s.windDownReminderEnabled);
  const optimalSleepMinutes = useSettings((s) => s.optimalSleepMinutes);
  useEffect(() => {
    if (!isOnboarded) return;
    updateWindDownNotification(windDownEnabled, optimalSleepMinutes).catch(() => {
      // permission denied or notifications unavailable - nothing to schedule
    });
  }, [isOnboarded, windDownEnabled, optimalSleepMinutes]);

  return (
    <ThemeProvider store={settingsStore} desaturated={isSleeping}>
      <ThemedStatusBar />
      <HomeWidgetSync />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          {!isOnboarded && <Redirect href="/onboarding" />}
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="log-editor" options={{ presentation: 'modal' }} />
            <Stack.Screen name="sleep-tips" options={{ presentation: 'modal' }} />
            <Stack.Screen
              name="timeline-sheet"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.82, 1.0],
                sheetGrabberVisible: true,
                ...ANDROID_SHEET,
              }}
            />
            <Stack.Screen
              name="metrics-explanation"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.6, 1.0],
                sheetGrabberVisible: true,
                ...ANDROID_SHEET,
              }}
            />
          </Stack>
          <DemoExitControl />
          <AppAlertHost />
        </View>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}

// the root boundary records render errors with their component stack and shows
// the fallback instead of a blank screen
export default function ObservedRootLayout() {
  return (
    <ObserveRoot errorBoundaryFallback={<AppCrashFallback />}>
      <RootLayout />
    </ObserveRoot>
  );
}
