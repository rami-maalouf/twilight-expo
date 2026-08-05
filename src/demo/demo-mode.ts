import type { SleepSession } from '../domain/models';

export const isDemoMode = process.env.EXPO_PUBLIC_DEMO_MODE === '1';
export const DEMO_SESSION_ID_PREFIX = 'rami-demo-session-';

const MINUTES_PER_DAY = 24 * 60;
const HEALTHY_DURATION_MINIMUM = 395;
const HEALTHY_DURATION_MAXIMUM = 505;
const HEALTHY_DURATION_SHORTENING_MINUTES = 35;
const HEALTHY_DURATION_DIP_ONE_MINUTES = 20;
const HEALTHY_DURATION_DIP_TWO_MINUTES = 20;
const HEALTHY_DURATION_BOOST_MINUTES = 15;

const bedtimePattern = [1410, 15, 1430, 35, 10, 85, 55, 1425, 25, 75, 100, 45, 1405, 60];
const durationPattern = [455, 440, 475, 430, 460, 420, 495, 445, 470, 435, 485, 450, 465, 425];

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

function healthySessionSource(index: number): DemoSleepSessionSource {
  let startMinute = bedtimePattern[index % bedtimePattern.length];
  let durationMinutes = durationPattern[index % durationPattern.length];

  if (index < 18) {
    startMinute += 25;
    durationMinutes -= 20;
  } else if (index >= 70) {
    startMinute -= 15;
    durationMinutes += 20;
  } else if (index >= 45) {
    startMinute -= 5;
    durationMinutes += 10;
  }

  startMinute += ((index * 19) % 7 - 3) * 5;
  durationMinutes += ((index * 11) % 5 - 2) * 5;

  if (index % 16 === 5) {
    startMinute += 25;
    durationMinutes -= 15;
  }
  if (index % 19 === 8) {
    startMinute -= 15;
    durationMinutes += 20;
  }
  if (index % 21 === 13) {
    startMinute += 15;
  }
  if (index % 9 === 4) {
    durationMinutes -= HEALTHY_DURATION_DIP_ONE_MINUTES;
  }
  if (index % 13 === 7) {
    durationMinutes += HEALTHY_DURATION_BOOST_MINUTES;
  }
  if (index % 17 === 6) {
    durationMinutes -= HEALTHY_DURATION_DIP_TWO_MINUTES;
  }

  const boundedDurationMinutes = Math.min(
    Math.max(durationMinutes, HEALTHY_DURATION_MINIMUM),
    HEALTHY_DURATION_MAXIMUM
  );

  return {
    startMinute: wrappedClockMinute(startMinute),
    durationMinutes: boundedDurationMinutes - HEALTHY_DURATION_SHORTENING_MINUTES,
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
    const source = healthySessionSource(index);
    const startMinute = roundedToNearestFiveMinutes(softenedNormalizedStartMinute(source.startMinute));
    const endMinute = startMinute + source.durationMinutes;
    const endDay = addLocalDays(latestSleepDay, index - 99);
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
