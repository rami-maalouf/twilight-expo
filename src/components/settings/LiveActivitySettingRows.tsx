// ports the tail of BlockedProfileView.swift's Notifications section: the
// "Live Activity" toggle and the "Go to settings to disable globally" link
// (hidden while sleeping). on android the live activity is the ongoing
// sleep notification, so the toggle uses android copy, asks for the
// notification permission when it is turned on, and says so when
// notifications are off for the app.
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, StyleSheet, Text } from 'react-native';

import {
  canPostSessionNotification,
  openNotificationSettings,
} from '../../../modules/twilight-widget-actions/session-notification';
import { syncLiveActivityNow } from '@/services/live-activity-sync';
import { useSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useTheme } from '@/theme/ThemeProvider';
import { showAlert } from '@/components/common/app-alert';
import { SettingsRow } from './SettingsList';
import { SettingsSwitchRow } from './SettingsSwitchRow';

const IS_ANDROID = Platform.OS === 'android';

const COPY = IS_ANDROID
  ? {
      title: 'Sleep Notification',
      description:
        'Shows your sleep timer and a Wake Up button on your lock screen, and counts down to bedtime while you wind down',
    }
  : {
      title: 'Live Activity',
      description: 'Shows a live activity on your lock screen with some inspirational quote',
    };

const BLOCKED_DESCRIPTION = 'Notifications are off for Twilight. Turn them on in system settings.';

function openSystemSettings() {
  if (!openNotificationSettings()) Linking.openSettings().catch(() => {});
}

export function LiveActivitySettingRows() {
  const theme = useTheme();
  const enabled = useSettings((s) => s.liveActivityEnabled);
  const setSetting = useSettings((s) => s.setSetting);
  const isSleeping = useSleepStore((s) => s.activeSession != null);
  const [canPost, setCanPost] = useState(() => !IS_ANDROID || canPostSessionNotification());

  useEffect(() => {
    if (!IS_ANDROID) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setCanPost(canPostSessionNotification());
    });
    return () => sub.remove();
  }, []);

  const onToggle = async (value: boolean) => {
    setSetting('liveActivityEnabled', value);
    if (!value || !IS_ANDROID || canPostSessionNotification()) return;
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    setCanPost(canPostSessionNotification());
    if (granted && canPostSessionNotification()) {
      // the sync hook already ran for the toggle, before posting was allowed
      await syncLiveActivityNow();
      return;
    }
    showAlert(
      'Notifications Are Off',
      'Turn on notifications for Twilight to see your sleep timer and Wake Up button on the lock screen.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Open Settings', onPress: openSystemSettings },
      ]
    );
  };

  const blocked = IS_ANDROID && enabled && !canPost;

  return (
    <>
      <SettingsSwitchRow
        testID="live-activity-toggle"
        title={COPY.title}
        description={blocked ? BLOCKED_DESCRIPTION : COPY.description}
        value={enabled}
        // swift CustomToggle isDisabled: isBlocking
        disabled={isSleeping}
        separator={!isSleeping}
        onValueChange={(value) => {
          onToggle(value).catch(() => {});
        }}
      />
      {!isSleeping && (
        <SettingsRow testID="system-notification-settings" accessibilityRole="link" onPress={openSystemSettings}>
          <Text style={[styles.caption, { color: theme.accent }]}>Go to settings to disable globally</Text>
        </SettingsRow>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  caption: { fontSize: 12 },
});
