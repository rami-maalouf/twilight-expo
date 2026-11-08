// pure decisions shared by the ios live activity and the android session
// notification: the 3-hour wind-down window before bedtime, the ids that
// tell one countdown from another, and the android notification specs.
// no react, react-native or expo imports: unit-tested in node.
import type { SessionNotificationSpec } from '../../modules/twilight-widget-actions/session-notification';
import { epochFromDayMinutes } from '../domain/editor';
import type { SleepSession } from '../domain/models';
import { addDays, sleepGoalSeconds, zonedParts } from '../domain/session-rules';

export const WIND_DOWN_WINDOW_MS = 3 * 3600_000;

// stored as settings.liveActivityId while a sleep activity is shown
export const SLEEP_ACTIVITY_ID = 'sleep';

// the id encodes the bedtime, so a changed bedtime replaces the countdown
// while an unchanged one is left alone
export function windDownActivityId(bedtimeMs: number): string {
  return `winddown:${bedtimeMs}`;
}

export function isWindDownActivityId(id: string | null): boolean {
  return id?.startsWith('winddown') ?? false;
}

// next bedtime instant; null when outside the 3-hour wind-down window
export function windDownBedtime(
  optimalSleepMinutes: number,
  nowMs: number,
  timeZone: string
): number | null {
  const p = zonedParts(nowMs, timeZone);
  const today = { year: p.year, month: p.month, day: p.day };
  let bedtime = epochFromDayMinutes(today, optimalSleepMinutes, timeZone);
  if (bedtime <= nowMs) {
    bedtime = epochFromDayMinutes(addDays(today, 1), optimalSleepMinutes, timeZone);
  }
  const msUntil = bedtime - nowMs;
  return msUntil > 0 && msUntil <= WIND_DOWN_WINDOW_MS ? bedtime : null;
}

// swift buildContentState: the session start and SleepSettings.sleepGoalSeconds
export function sleepNotificationSpec(
  session: SleepSession,
  optimalSleepMinutes: number,
  optimalWakeMinutes: number
): SessionNotificationSpec {
  return {
    kind: 'sleep',
    key: SLEEP_ACTIVITY_ID,
    startMs: session.startTime,
    goalSeconds: sleepGoalSeconds(optimalSleepMinutes, optimalWakeMinutes),
  };
}

export function windDownNotificationSpec(bedtimeMs: number): SessionNotificationSpec {
  return { kind: 'winddown', key: windDownActivityId(bedtimeMs), bedtimeMs };
}
