// ports: Utils/SleepRegularityIndex.swift
// session-based estimate of phillips et al. (2017), doi:10.1038/s41598-017-03171-4.
// logged intervals are treated as sleep; remaining time on recorded days is assumed awake.
// days run noon to noon in the given iana timezone (swift: Calendar.current).
// pure ts - no react or expo imports.
import { epochFromDayMinutes } from '../editor';
import type { CalendarDay } from '../models';
import { addDays, dayKey, zonedParts } from '../session-rules';

export const SLEEP_REGULARITY_WINDOWS = ['7D', '14D', '28D'] as const;
export type SleepRegularityWindow = (typeof SLEEP_REGULARITY_WINDOWS)[number];

export function windowDays(window: SleepRegularityWindow): number {
  return window === '28D' ? 28 : window === '14D' ? 14 : 7;
}

export interface SleepInterval {
  // epoch ms
  start: number;
  end: number;
}

export interface SleepRegularityPoint {
  // calendar day of the noon that closes this point's window
  date: CalendarDay;
  dayToDayScore: number | null;
  rollingScore: number | null;
  comparisonDays: number;
  segment: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOON_MINUTES = 12 * 60;

function noonOf(day: CalendarDay, timeZone: string): number {
  return epochFromDayMinutes(day, NOON_MINUTES, timeZone);
}

// the noon-to-noon day containing an instant, identified by its starting noon's calendar day
function noonDayContaining(epochMs: number, timeZone: string): CalendarDay {
  const p = zonedParts(epochMs, timeZone);
  const day = { year: p.year, month: p.month, day: p.day };
  return epochMs < noonOf(day, timeZone) ? addDays(day, -1) : day;
}

function merged(intervals: readonly SleepInterval[]): SleepInterval[] {
  const result: SleepInterval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = result[result.length - 1];
    if (last && interval.start <= last.end) {
      result[result.length - 1] = { start: last.start, end: Math.max(last.end, interval.end) };
    } else {
      result.push({ ...interval });
    }
  }
  return result;
}

export function sleepRegularitySeries(
  intervals: readonly SleepInterval[],
  options: {
    days: number | null;
    window?: SleepRegularityWindow;
    referenceMs?: number;
    timeZone?: string;
  }
): SleepRegularityPoint[] {
  const window = options.window ?? '7D';
  const comparisonCount = windowDays(window) - 1;
  const referenceMs = options.referenceMs ?? Date.now();
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

  const valid = intervals.filter(
    (i) => i.end - i.start > 0 && i.end - i.start <= DAY_MS && i.end <= referenceMs
  );
  if (valid.length === 0) return [];
  const firstStart = Math.min(...valid.map((i) => i.start));

  // keep every session, including naps, and union overlaps before measuring agreement.
  const recordedDays = new Map<string, { day: CalendarDay; intervals: SleepInterval[] }>();
  for (const interval of valid) {
    let day = noonDayContaining(interval.start, timeZone);
    let start = noonOf(day, timeZone);
    while (start < interval.end) {
      const nextDay = addDays(day, 1);
      const end = noonOf(nextDay, timeZone);
      if (end <= referenceMs && end - start === DAY_MS) {
        const clippedStart = Math.max(start, interval.start);
        const clippedEnd = Math.min(end, interval.end);
        if (clippedEnd > clippedStart) {
          const key = dayKey(day);
          const entry = recordedDays.get(key) ?? { day, intervals: [] };
          entry.intervals.push({ start: clippedStart, end: clippedEnd });
          recordedDays.set(key, entry);
        }
      }
      day = nextDay;
      start = end;
    }
  }
  for (const entry of recordedDays.values()) entry.intervals = merged(entry.intervals);

  const dailyScores = new Map<string, number>();
  for (const { day, intervals: current } of recordedDays.values()) {
    // missing days and daylight-saving transition days never become all-awake days.
    // recorded days are exactly 24h, so the next noon is start + 24h.
    const next = recordedDays.get(dayKey(addDays(day, 1)));
    if (!next) continue;
    const shifted = next.intervals.map((i) => ({ start: i.start - DAY_MS, end: i.end - DAY_MS }));
    let overlap = 0;
    for (const left of current) {
      for (const right of shifted) {
        overlap += Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
      }
    }
    const total = (list: readonly SleepInterval[]) =>
      list.reduce((sum, i) => sum + (i.end - i.start), 0);
    // symmetric difference measures mismatched states exactly, without epoch rounding.
    const disagreement = total(current) + total(shifted) - 2 * overlap;
    dailyScores.set(dayKey(addDays(day, 2)), 100 - (200 * disagreement) / DAY_MS);
  }

  const lastCompleteDay = noonDayContaining(referenceMs, timeZone);
  const lastKey = dayKey(lastCompleteDay);
  let end = addDays(noonDayContaining(firstStart, timeZone), 1);
  if (options.days != null) {
    if (options.days <= 0) return [];
    const cutoff = addDays(lastCompleteDay, -(options.days - 1));
    if (dayKey(cutoff) > dayKey(end)) end = cutoff;
  }

  const result: SleepRegularityPoint[] = [];
  let segment = 0;
  while (dayKey(end) <= lastKey) {
    // n calendar days contain n - 1 adjacent-day comparisons. history filtering
    // happens after comparisons, so the first visible point retains its lookback.
    const comparisons: number[] = [];
    for (let offset = 0; offset < comparisonCount; offset++) {
      const score = dailyScores.get(dayKey(addDays(end, -offset)));
      if (score != null) comparisons.push(score);
    }
    const rollingScore =
      comparisons.length === comparisonCount
        ? comparisons.reduce((a, b) => a + b, 0) / comparisonCount
        : null;
    if (rollingScore == null) segment += 1;
    result.push({
      date: end,
      dayToDayScore: dailyScores.get(dayKey(end)) ?? null,
      rollingScore,
      comparisonDays: comparisons.length,
      segment,
    });
    end = addDays(end, 1);
  }
  return result;
}
