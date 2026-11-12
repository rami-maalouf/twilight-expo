// the wind-down window, countdown ids and android session notification specs
import type { SleepSession } from '../../domain/models';
import {
  isWindDownActivityId,
  SLEEP_ACTIVITY_ID,
  sleepNotificationKey,
  sleepNotificationSpec,
  windDownActivityId,
  windDownBedtime,
  windDownNotificationSpec,
  WIND_DOWN_WINDOW_MS,
} from '../live-activity-plan';

const TZ = 'America/Denver';
const HOUR = 3600_000;
// 2025-01-15 23:00 in denver (utc-7)
const BEDTIME_2300 = Date.UTC(2025, 0, 16, 6, 0, 0);
const BEDTIME_MINUTES = 23 * 60;

describe('windDownBedtime', () => {
  test('inside the 3-hour window: the upcoming bedtime', () => {
    expect(windDownBedtime(BEDTIME_MINUTES, BEDTIME_2300 - WIND_DOWN_WINDOW_MS, TZ)).toBe(BEDTIME_2300);
    expect(windDownBedtime(BEDTIME_MINUTES, BEDTIME_2300 - 60_000, TZ)).toBe(BEDTIME_2300);
  });

  test('outside the window or once bedtime passed: none', () => {
    expect(windDownBedtime(BEDTIME_MINUTES, BEDTIME_2300 - WIND_DOWN_WINDOW_MS - 1, TZ)).toBeNull();
    expect(windDownBedtime(BEDTIME_MINUTES, BEDTIME_2300, TZ)).toBeNull();
    expect(windDownBedtime(BEDTIME_MINUTES, BEDTIME_2300 + HOUR, TZ)).toBeNull();
  });

  test('a bedtime after midnight counts down from the evening before', () => {
    // 00:30 bedtime, now 22:00 the evening before
    const now = Date.UTC(2025, 0, 16, 5, 0, 0);
    expect(windDownBedtime(30, now, TZ)).toBe(Date.UTC(2025, 0, 16, 7, 30, 0));
  });

  test('follows the device zone across dst', () => {
    // 2025-03-09: denver springs forward at 02:00; 23:00 on the 9th is utc-6
    const bedtime = Date.UTC(2025, 2, 10, 5, 0, 0);
    expect(windDownBedtime(BEDTIME_MINUTES, bedtime - HOUR, TZ)).toBe(bedtime);
  });
});

describe('activity ids', () => {
  test('the countdown id encodes its bedtime', () => {
    expect(windDownActivityId(BEDTIME_2300)).toBe(`winddown:${BEDTIME_2300}`);
    expect(windDownActivityId(BEDTIME_2300)).not.toBe(windDownActivityId(BEDTIME_2300 + 60_000));
    expect(isWindDownActivityId(windDownActivityId(BEDTIME_2300))).toBe(true);
    expect(isWindDownActivityId(SLEEP_ACTIVITY_ID)).toBe(false);
    expect(isWindDownActivityId(null)).toBe(false);
  });
});

describe('session notification specs', () => {
  const session: SleepSession = {
    id: 's1',
    tag: 'Sleep Mode',
    startTime: BEDTIME_2300,
    endTime: null,
    startTimeZone: TZ,
    endTimeZone: null,
    createdAt: BEDTIME_2300,
    updatedAt: BEDTIME_2300,
  };

  test('sleep: session start and the goal from the bedtime and wake targets', () => {
    expect(sleepNotificationSpec(session, BEDTIME_MINUTES, 7 * 60)).toEqual({
      kind: 'sleep',
      key: `sleep:${BEDTIME_2300}`,
      startMs: BEDTIME_2300,
      goalSeconds: 8 * 3600,
    });
    // same-day targets (a nap schedule) still give a positive goal
    expect(sleepNotificationSpec(session, 13 * 60, 14 * 60 + 30)).toMatchObject({ goalSeconds: 90 * 60 });
  });

  test('sleep: keyed by session, so a swipe only hides that session and a goal change keeps the key', () => {
    const next = { ...session, id: 's2', startTime: BEDTIME_2300 + 24 * HOUR };
    expect(sleepNotificationKey(BEDTIME_2300)).toBe(`sleep:${BEDTIME_2300}`);
    expect(sleepNotificationSpec(session, BEDTIME_MINUTES, 8 * 60).key).toBe(
      sleepNotificationSpec(session, BEDTIME_MINUTES, 7 * 60).key
    );
    expect(sleepNotificationSpec(next, BEDTIME_MINUTES, 7 * 60).key).not.toBe(
      sleepNotificationSpec(session, BEDTIME_MINUTES, 7 * 60).key
    );
    expect(isWindDownActivityId(sleepNotificationKey(BEDTIME_2300))).toBe(false);
  });

  test('wind-down: keyed by bedtime', () => {
    expect(windDownNotificationSpec(BEDTIME_2300)).toEqual({
      kind: 'winddown',
      key: `winddown:${BEDTIME_2300}`,
      bedtimeMs: BEDTIME_2300,
    });
  });
});
