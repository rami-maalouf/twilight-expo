// ports TimingPalette duration richness helpers from SleepDashboardView.swift
import {
  durationAverageRange,
  durationRichness,
  formatNightDelta,
  formatNightLength,
  formatSignedMinutes,
  TimingPalette,
} from '@/domain/metrics/timing-helpers';

describe('timing formatters', () => {
  test('formatSignedMinutes matches Swift direction copy', () => {
    expect(formatSignedMinutes(null)).toBe('-');
    expect(formatSignedMinutes(0)).toBe('same time');
    expect(formatSignedMinutes(0.005)).toBe('same time');
    expect(formatSignedMinutes(0.5)).toBe('30m later');
    expect(formatSignedMinutes(-1.25)).toBe('1h 15m earlier');
    expect(formatSignedMinutes(2)).toBe('2h later');
  });

  test('formatNightLength and formatNightDelta', () => {
    expect(formatNightLength(null)).toBe('-');
    expect(formatNightLength(7)).toBe('7h');
    expect(formatNightLength(7.5)).toBe('7h 30m');
    expect(formatNightDelta(null)).toBe('vs 7-night avg');
    expect(formatNightDelta(0)).toBe('same length');
    expect(formatNightDelta(0.5)).toBe('30m longer');
    expect(formatNightDelta(-1)).toBe('1h shorter');
  });
});

describe('duration richness', () => {
  test('falls back around target when no paired averages', () => {
    expect(durationAverageRange([], 8)).toEqual({ lower: 7, upper: 8 });
  });

  test('boosts contrast around the midpoint', () => {
    const range = { lower: 6, upper: 8 };
    expect(durationRichness(6, range)).toBeCloseTo(0, 5);
    expect(durationRichness(8, range)).toBeCloseTo(1, 5);
    expect(durationRichness(7, range)).toBeCloseTo(0.5, 5);
  });

  test('palette mix endpoints', () => {
    expect(TimingPalette.sleepAverage(0)).toBe('rgb(41, 51, 122)');
    expect(TimingPalette.sleepAverage(1)).toBe('rgb(219, 227, 255)');
    expect(TimingPalette.wakeAverage(0)).toBe('rgb(97, 71, 26)');
    expect(TimingPalette.wakeAverage(1)).toBe('rgb(255, 240, 199)');
  });
});
