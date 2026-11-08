// the android session notification (TwilightSessionNotification.kt): the
// live activity's android twin. every call is a no-op without the native
// module (ios, web, jest).
import { requireOptionalNativeModule } from 'expo';

export type SessionNotificationSpec =
  | { kind: 'sleep'; key: string; startMs: number; goalSeconds: number }
  | { kind: 'winddown'; key: string; bedtimeMs: number };

export type SessionNotificationKind = SessionNotificationSpec['kind'];

// 'disabled': notifications or the channel are off; 'dismissed': the user
// swiped this wind-down countdown away; 'expired': bedtime already passed
export type SessionNotificationPostResult = 'posted' | 'disabled' | 'dismissed' | 'expired' | 'unavailable';

export interface ActiveSessionNotification {
  kind: SessionNotificationKind;
  key: string;
}

interface TwilightSessionNotificationNative {
  post(spec: SessionNotificationSpec): SessionNotificationPostResult;
  cancel(kind: SessionNotificationKind | null): void;
  getActive(): ActiveSessionNotification | null;
  canPost(): boolean;
  openNotificationSettings(): void;
}

const native = requireOptionalNativeModule<TwilightSessionNotificationNative>(
  'TwilightSessionNotification'
);

export const SESSION_NOTIFICATION_AVAILABLE = native != null;

export function postSessionNotification(spec: SessionNotificationSpec): SessionNotificationPostResult {
  return native?.post(spec) ?? 'unavailable';
}

// removes the notification when it shows `kind` (any kind when omitted)
export function cancelSessionNotification(kind?: SessionNotificationKind): void {
  native?.cancel(kind ?? null);
}

export function activeSessionNotification(): ActiveSessionNotification | null {
  return native?.getActive() ?? null;
}

export function canPostSessionNotification(): boolean {
  return native?.canPost() ?? false;
}

export function openNotificationSettings(): boolean {
  if (!native) return false;
  native.openNotificationSettings();
  return true;
}
