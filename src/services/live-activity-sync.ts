// the live activity / session notification lifecycle steps that do not need
// react: the sync hook runs them while the app is up, and the android
// headless task runs them after a notification button with no ui mounted
import { settingsStore } from '../data/app-db';
import { appSleepStore } from '../state/app-sleep-store';
import {
  endWindDownActivity,
  reconcileLiveActivity,
  startWindDownActivity,
} from './live-activity';
import { windDownBedtime } from './live-activity-plan';

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

// inside the 3-hour window: show (or keep) the countdown; outside it: clear
// an expired countdown left on the lock screen
export async function refreshWindDown(nowMs: number = Date.now()): Promise<void> {
  if (appSleepStore.getState().activeSession) return;
  const bedtime = windDownBedtime(settingsStore.get('optimalSleepMinutes'), nowMs, deviceTimeZone());
  if (bedtime != null) {
    await startWindDownActivity(bedtime);
  } else {
    await endWindDownActivity();
  }
}

// brings the activity in line with the stored session and settings
export async function syncLiveActivityNow(): Promise<void> {
  const activeSession = appSleepStore.getState().activeSession;
  await reconcileLiveActivity(activeSession);
  if (!activeSession) await refreshWindDown();
}
