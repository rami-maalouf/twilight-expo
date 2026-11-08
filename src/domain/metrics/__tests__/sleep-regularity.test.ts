// ports twilightTests/SleepRegularityIndexTests.swift case for case
import { epochFromDayMinutes } from '@/domain/editor';
import {
  SLEEP_REGULARITY_WINDOWS,
  sleepRegularitySeries,
  windowDays,
  type SleepInterval,
  type SleepRegularityWindow,
} from '@/domain/metrics/sleep-regularity';
import { addDays, dayKey } from '@/domain/session-rules';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BASE = Date.UTC(2026, 8, 1, 12);

function sleepMinutes(index: number, offsetMinutes: number, durationMinutes: number): SleepInterval {
  const start = BASE + index * DAY + offsetMinutes * MINUTE;
  return { start, end: start + durationMinutes * MINUTE };
}

function sleep(index: number, offset = 11, hours = 8): SleepInterval {
  return sleepMinutes(index, offset * 60, hours * 60);
}

function series(
  intervals: SleepInterval[],
  { days = null, now, window }: { days?: number | null; now?: number; window?: SleepRegularityWindow } = {}
) {
  return sleepRegularitySeries(intervals, {
    days,
    window,
    referenceMs: now ?? BASE + 7 * DAY,
    timeZone: 'UTC',
  });
}

const baseDay = { year: 2026, month: 9, day: 1 };
const dayAt = (offset: number) => dayKey(addDays(baseDay, offset));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('sleep regularity index', () => {
  test('identical week scores 100 only after seven days', () => {
    const result = series(range(7).map((i) => sleep(i)));
    expect(result.at(-1)?.rollingScore).toBe(100);
    expect(result.at(-1)?.comparisonDays).toBe(6);
    expect(result.slice(0, -1).every((p) => p.rollingScore == null)).toBe(true);
  });

  test('one hour alternating shift has two hours of disagreement', () => {
    const result = series(range(7).map((i) => sleep(i, i % 2 === 0 ? 11 : 12)));
    expect(result.at(-1)!.rollingScore!).toBeCloseTo(100 - (200 * 2) / 24, 6);
  });

  test('opposite twelve hour schedules can score negative', () => {
    const result = series(range(7).map((i) => sleep(i, i % 2 === 0 ? 0 : 12, 12)));
    expect(result.at(-1)?.rollingScore).toBe(-100);
  });

  test('missing day is not awake and does not bridge gap', () => {
    const result = series([0, 1, 2, 4, 5, 6].map((i) => sleep(i)));
    expect(result.at(-1)?.comparisonDays).toBe(4);
    expect(result.at(-1)?.rollingScore).toBeNull();
    expect(result[3].dayToDayScore).toBeNull();
    expect(result[4].dayToDayScore).toBeNull();
    expect(result.at(-1)?.dayToDayScore).toBe(100);
  });

  test('duplicates and overlaps do not change score', () => {
    const intervals = range(7).map((i) => sleep(i));
    const result = series([...intervals, ...intervals, ...range(7).map((i) => sleep(i, 12, 2))]);
    expect(result.at(-1)?.rollingScore).toBe(100);
  });

  test('naps contribute to score', () => {
    const intervals = [...range(7).map((i) => sleep(i)), ...[0, 2, 4, 6].map((i) => sleep(i, 2, 1))];
    expect(series(intervals).at(-1)!.rollingScore!).toBeCloseTo(100 - 200 / 24, 6);
  });

  test('incomplete and future days are excluded', () => {
    const result = series(range(9).map((i) => sleep(i)), { now: BASE + 6 * DAY + 20 * HOUR });
    expect(result.at(-1)?.comparisonDays).toBe(5);
    expect(result.at(-1)?.rollingScore).toBeNull();
    expect(dayKey(result.at(-1)!.date)).toBe(dayAt(6));
  });

  test('history range preserves lookback and does not change scores', () => {
    const intervals = range(14).map((i) => sleep(i, 9 + (i % 4)));
    const now = BASE + 14 * DAY;
    const full = series(intervals, { now });
    const restricted = series(intervals, { days: 3, now });
    expect(restricted.map((p) => dayKey(p.date))).toEqual(full.slice(-3).map((p) => dayKey(p.date)));
    expect(restricted.map((p) => p.rollingScore)).toEqual(full.slice(-3).map((p) => p.rollingScore));
    expect(restricted[0].rollingScore).not.toBeNull();
  });

  test('empty and single day do not produce score', () => {
    expect(series([])).toEqual([]);
    expect(series([sleep(0)]).at(-1)?.rollingScore).toBeNull();
    expect(series([sleep(0)], { days: 0 })).toEqual([]);
  });

  test('long sessions are excluded', () => {
    expect(series([sleep(0, 11, 48)])).toEqual([]);
  });

  test('both dst transitions leave gaps instead of wrong lag', () => {
    const timeZone = 'America/Toronto';
    for (const [month, startDay] of [
      [3, 5],
      [10, 29],
    ]) {
      const start = { year: 2026, month, day: startDay };
      const intervals = range(9).map((i) => ({
        start: epochFromDayMinutes(addDays(start, i), 23 * 60, timeZone),
        end: epochFromDayMinutes(addDays(start, i + 1), 7 * 60, timeZone),
      }));
      const now = intervals.at(-1)!.end + 5 * HOUR;
      const result = sleepRegularitySeries(intervals, { days: null, referenceMs: now, timeZone });
      const scores = result.map((p) => p.dayToDayScore).filter((s): s is number => s != null);
      expect(scores.every((s) => Math.abs(s - 100) < 1e-9)).toBe(true);
      expect(result.filter((p) => p.dayToDayScore == null)).toHaveLength(3);
    }
  });

  test('rolling window drops old irregularity after exactly seven days', () => {
    const intervals = range(14).map((i) => sleep(i, i === 0 ? 12 : 11));
    const result = series(intervals, { now: BASE + 14 * DAY });
    expect(result[6].rollingScore!).toBeLessThan(100);
    expect(result[7].rollingScore).toBe(100);
    expect(result[7].comparisonDays).toBe(6);
  });

  test('scattered comparisons do not unlock weekly score', () => {
    const intervals = [0, 1, 3, 4, 6, 7, 9, 10, 12, 13, 15, 16].map((i) => sleep(i));
    const result = series(intervals, { now: BASE + 17 * DAY });
    expect(result.filter((p) => p.dayToDayScore != null)).toHaveLength(6);
    expect(result.every((p) => p.rollingScore == null)).toBe(true);
  });

  test('gap splits line and recovers after full week', () => {
    const intervals = range(16)
      .filter((i) => i !== 7)
      .map((i) => sleep(i));
    const result = series(intervals, { now: BASE + 16 * DAY });
    expect(result[6].rollingScore).toBe(100);
    expect(result.slice(7, 14).every((p) => p.rollingScore == null)).toBe(true);
    expect(result[14].rollingScore).toBe(100);
    expect(result[6].segment).not.toBe(result[14].segment);
  });

  test('stale history does not masquerade as current score', () => {
    const result = series(range(7).map((i) => sleep(i)), { now: BASE + 20 * DAY });
    expect(result[6].rollingScore).toBe(100);
    expect(dayKey(result.at(-1)!.date)).toBe(dayAt(20));
    expect(result.at(-1)?.rollingScore).toBeNull();
  });

  test('interval calculation matches independent epoch definition', () => {
    // same 64-bit lcg as the swift test so the schedules are identical
    let seed = 71n;
    const mask = (1n << 64n) - 1n;
    const random = (bound: number) => {
      seed = (seed * 6364136223846793005n + 1n) & mask;
      return Number((seed >> 32n) % BigInt(bound));
    };
    for (let run = 0; run < 24; run++) {
      const intervals = range(7).flatMap((index) => {
        const startMinute = 300 + random(400);
        const durationMinutes = 240 + random(300);
        const main = sleepMinutes(index, startMinute, durationMinutes);
        const napOffset = random(180);
        const napDuration = 10 + random(80);
        return [main, sleepMinutes(index, napOffset, napDuration)];
      });
      // independent oracle: compare binary states at each minute, 24 hours apart.
      let matches = 0;
      for (let minute = 0; minute < 6 * 1440; minute++) {
        const time = BASE + (minute + 0.5) * MINUTE;
        const next = time + DAY;
        const asleep = intervals.some((i) => i.start <= time && time < i.end);
        const asleepNext = intervals.some((i) => i.start <= next && next < i.end);
        if (asleep === asleepNext) matches++;
      }
      const expected = (200 * matches) / (6 * 1440) - 100;
      expect(series(intervals).at(-1)!.rollingScore!).toBeCloseTo(expected, 6);
    }
  });

  test('fragmentation and noon crossing are compared as states', () => {
    const intervals = range(9).flatMap((i) => [sleep(i, -1, 3), sleep(i, 12, 3), sleep(i, 16, 3)]);
    const result = series(intervals, { now: BASE + 10 * DAY });
    const week = result.find((p) => dayKey(p.date) === dayAt(7));
    expect(week?.rollingScore).toBe(100);
  });

  test('all window lengths require their own complete comparisons', () => {
    for (const window of SLEEP_REGULARITY_WINDOWS) {
      const days = windowDays(window);
      const intervals = range(days).map((i) => sleep(i, i % 2 === 0 ? 11 : 12));
      const result = series(intervals, { window, now: BASE + days * DAY });
      expect(result.slice(0, -1).every((p) => p.rollingScore == null)).toBe(true);
      expect(result.at(-1)?.comparisonDays).toBe(days - 1);
      expect(result.at(-1)!.rollingScore!).toBeCloseTo(100 - (200 * 2) / 24, 6);
    }
  });

  test('longer windows retain lookback and reject missing days', () => {
    for (const window of ['14D', '28D'] as const) {
      const intervals = range(35).map((i) => sleep(i, i === 15 ? 12 : 11));
      const now = BASE + 35 * DAY;
      const full = series(intervals, { window, now });
      const short = series(intervals, { window, now, days: 3 });
      expect(short.map((p) => p.rollingScore)).toEqual(full.slice(-3).map((p) => p.rollingScore));
      const missing = series(intervals.slice(0, -1), { window, now });
      expect(missing.at(-1)?.rollingScore).toBeNull();
      expect(missing.at(-1)?.comparisonDays).toBe(windowDays(window) - 2);
    }
  });
});
