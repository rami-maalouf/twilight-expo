// ports: Utils/WindDownNotificationManager.swift
// daily wind-down reminder 3 hours before bedtime via expo-notifications
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { WIND_DOWN_MESSAGES, WIND_DOWN_TITLE, windDownReminderTime } from '../copy/winddown';

const NOTIFICATION_IDENTIFIER = 'wind-down-reminder';
// android lists every channel by name in the app's notification settings
// (ios has no channels). the session notification's channels are native
// (modules/twilight-widget-actions).
export const WIND_DOWN_CHANNEL_ID = 'wind-down-reminders';

async function ensureWindDownChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(WIND_DOWN_CHANNEL_ID, {
    name: 'Wind-down reminders',
    description: 'A daily reminder 3 hours before bedtime to start winding down',
    importance: AndroidImportance.DEFAULT,
  });
}

// the original has no UNUserNotificationCenterDelegate, so ios keeps a
// reminder out of the foreground. sdk 58 shows foreground notifications by
// default when no handler is set; this handler keeps the original behavior
// on both platforms. call once at module load, before any notification arrives.
export function configureForegroundNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function cancelWindDownNotification(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_IDENTIFIER);
}

export async function scheduleWindDownNotification(optimalSleepMinutes: number): Promise<void> {
  await cancelWindDownNotification();

  const permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) return;

  await ensureWindDownChannel();
  const { hour, minute } = windDownReminderTime(optimalSleepMinutes);
  const body = WIND_DOWN_MESSAGES[Math.floor(Math.random() * WIND_DOWN_MESSAGES.length)];

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_IDENTIFIER,
    content: { title: WIND_DOWN_TITLE, body, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      channelId: WIND_DOWN_CHANNEL_ID,
      hour,
      minute,
    },
  });
}

// ports updateNotification(): schedule when enabled, cancel when disabled
export async function updateWindDownNotification(
  enabled: boolean,
  optimalSleepMinutes: number
): Promise<void> {
  if (enabled) {
    await scheduleWindDownNotification(optimalSleepMinutes);
  } else {
    await cancelWindDownNotification();
  }
}
