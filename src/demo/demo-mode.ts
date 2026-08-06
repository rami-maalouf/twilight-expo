import type { SleepSession } from '../domain/models';

export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
export const DEMO_SESSION_ID_PREFIX = 'rami-demo-session-';

const MINUTES_PER_DAY = 24 * 60;
const HEALTHY_DURATION_MINIMUM = 300;
const HEALTHY_DURATION_MAXIMUM = 570;

const bedtimeVariationPattern = [
  -35, 10, 55, -15, 80, 25, -45, 40, -5, 65, -30, 15, 95, -55, 35, 0, 50, -20,
  70, 20, -40, 45, -10, 85, -25, 30, 110, -60,
];
const durationPattern = [
  470, 420, 455, 385, 510, 360, 445, 495, 405, 435, 540, 330, 465, 390, 500, 410,
  450, 370, 520, 430, 475, 345, 490, 400, 455, 380, 530, 425,
];

interface DemoSleepSessionSource {
  startMinute: number;
  durationMinutes: number;
}

function wrappedClockMinute(minute: number): number {
  return ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function roundedToNearestFiveMinutes(minute: number): number {
  return Math.round(minute / 5) * 5 % MINUTES_PER_DAY;
}

function softenedNormalizedStartMinute(minute: number): number {
  let normalizedMinute = minute >= 18 * 60 ? minute : minute + MINUTES_PER_DAY;
  if (normalizedMinute < 23 * 60 + 30) {
    normalizedMinute += Math.round((23 * 60 + 30 - normalizedMinute) * 0.35);
  } else if (normalizedMinute > MINUTES_PER_DAY + 6 * 60 + 15) {
    normalizedMinute -= Math.round((normalizedMinute - (MINUTES_PER_DAY + 6 * 60 + 15)) * 0.35);
  }
  return normalizedMinute;
}

function healthySessionSource(index: number, wakeDay: Date): DemoSleepSessionSource {
  const wakeWeekday = wakeDay.getDay();
  const isWeekendWake = wakeWeekday === 0 || wakeWeekday === 6;
  let startMinute = 23 * 60 + 45 + bedtimeVariationPattern[index % bedtimeVariationPattern.length];
  let durationMinutes = durationPattern[index % durationPattern.length];

  if (isWeekendWake) {
    startMinute += 65;
    durationMinutes += 30;
  } else if (wakeWeekday === 1) {
    durationMinutes -= 25;
  }

  if (index < 25) {
    startMinute += 35;
    durationMinutes -= 20;
  } else if (index >= 75) {
    startMinute -= 15;
    durationMinutes += 10;
  }

  if (index % 18 === 4) {
    startMinute += 70;
    durationMinutes -= 90;
  }
  if (index % 23 === 8) {
    durationMinutes += 65;
  }
  if (index % 27 === 14) {
    startMinute -= 40;
    durationMinutes += 50;
  }
  if (index % 31 === 22) {
    startMinute += 100;
    durationMinutes += 20;
  }

  const boundedDurationMinutes = Math.min(
    Math.max(durationMinutes, HEALTHY_DURATION_MINIMUM),
    HEALTHY_DURATION_MAXIMUM
  );

  return {
    startMinute: wrappedClockMinute(startMinute),
    durationMinutes: boundedDurationMinutes,
  };
}

function startOfLocalDay(epochMs: number): Date {
  const date = new Date(epochMs);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function localTimestamp(day: Date, minute: number): number {
  const result = new Date(day);
  result.setHours(0, minute, 0, 0);
  return result.getTime();
}

// ports DemoSleepDataManager's active healthy preset exactly.
export function createDemoSleepSessions(now = Date.now()): SleepSession[] {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const latestSleepDay = addLocalDays(startOfLocalDay(now), -1);
  const importedAt = now;

  return Array.from({ length: 100 }, (_, index) => {
    const endDay = addLocalDays(latestSleepDay, index - 99);
    const source = healthySessionSource(index, endDay);
    const startMinute = roundedToNearestFiveMinutes(softenedNormalizedStartMinute(source.startMinute));
    const endMinute = startMinute + source.durationMinutes;
    const startDay = endMinute >= MINUTES_PER_DAY ? addLocalDays(endDay, -1) : endDay;

    return {
      id: `${DEMO_SESSION_ID_PREFIX}${index + 1}`,
      tag: 'Demo Log',
      startTime: localTimestamp(startDay, startMinute),
      endTime: localTimestamp(endDay, endMinute % MINUTES_PER_DAY),
      startTimeZone: timeZone,
      endTimeZone: timeZone,
      createdAt: importedAt,
      updatedAt: importedAt,
    };
  });
}
