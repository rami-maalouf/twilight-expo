// ports the tail of BlockedProfileView.swift's Notifications section: the
// "Live Activity" toggle and the "Go to settings to disable globally" link
// (hidden while sleeping). on android the live activity is the ongoing
// sleep notification, so the toggle uses android copy, asks for the
// notification permission when it is turned on, and says so when
// notifications are off for the app.
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  canPostSessionNotification,
  openNotificationSettings,
} from '../../../modules/twilight-widget-actions/session-notification';
import { syncLiveActivityNow } from '@/services/live-activity-sync';
import { useSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useTheme } from '@/theme/ThemeProvider';

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

export function LiveActivitySettingRows({ rowBg }: { rowBg: string }) {
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
    Alert.alert(
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
      <View
        style={[styles.row, styles.toggleRow, { backgroundColor: rowBg }, !isSleeping && styles.rowWithSeparator]}>
        <View style={styles.toggleTexts}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{COPY.title}</Text>
          <Text style={styles.rowDescription}>{blocked ? BLOCKED_DESCRIPTION : COPY.description}</Text>
        </View>
        <Switch
          testID="live-activity-toggle"
          accessibilityLabel={COPY.title}
          value={enabled}
          onValueChange={(value) => {
            onToggle(value).catch(() => {});
          }}
          trackColor={{ true: theme.actionPrimary }}
        />
      </View>
      {!isSleeping && (
        <Pressable testID="system-notification-settings" accessibilityRole="link" onPress={openSystemSettings}>
          <View style={[styles.row, { backgroundColor: rowBg }]}>
            <Text style={[styles.caption, { color: theme.accent }]}>Go to settings to disable globally</Text>
          </View>
        </Pressable>
      )}
    </>
  );
}

// matches the settings screen's row styles
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowWithSeparator: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(84, 84, 88, 0.6)',
  },
  toggleRow: { alignItems: 'center' },
  toggleTexts: { flex: 1 },
  rowLabel: { fontSize: 17 },
  rowDescription: { fontSize: 12, color: '#98989f', marginTop: 2 },
  caption: { fontSize: 12 },
});
