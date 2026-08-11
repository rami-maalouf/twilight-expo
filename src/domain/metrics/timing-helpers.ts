// ports: TimingPalette + HomeTimingCard pure helpers from SleepDashboardView.swift
// no react / skia imports - safe for unit tests

export const TimingPalette = {
  earlier: '#2EE6A6',
  later: '#FF6B6B',
  sleep: '#6B7CFF',
  wake: '#E8B86D',
  mix(from: [number, number, number], to: [number, number, number], amount: number): string {
    const t = Math.min(Math.max(amount, 0), 1);
    const r = from[0] + (to[0] - from[0]) * t;
    const g = from[1] + (to[1] - from[1]) * t;
    const b = from[2] + (to[2] - from[2]) * t;
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
  },
  sleepAverage(richness: number): string {
    return TimingPalette.mix([0.16, 0.2, 0.48], [0.86, 0.89, 1.0], richness);
  },
  wakeAverage(richness: number): string {
    return TimingPalette.mix([0.38, 0.28, 0.1], [1.0, 0.94, 0.78], richness);
  },
};

export function durationAverageRange(
  hours: readonly number[],
  targetDurationHours: number
): { lower: number; upper: number } {
  if (hours.length === 0) {
    return { lower: targetDurationHours - 1, upper: targetDurationHours };
  }
  const minHours = Math.min(...hours);
  const maxHours = Math.max(...hours);
  const span = Math.max(maxHours - minHours, 0.2);
  return { lower: minHours, upper: minHours + span };
}

export function durationRichness(
  hours: number,
  range: { lower: number; upper: number }
): number {
  const linear = Math.min(
    Math.max((hours - range.lower) / (range.upper - range.lower || 1), 0),
    1
  );
  return Math.min(Math.max((linear - 0.5) * 1.35 + 0.5, 0), 1);
}

export function formatSignedMinutes(hours: number | null): string {
  if (hours == null) return '-';
  if (Math.abs(hours) <= 0.008) return 'same time';
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const hourPart = Math.trunc(totalMinutes / 60);
  const minutePart = totalMinutes % 60;
  const direction = hours > 0 ? 'later' : 'earlier';
  if (hourPart > 0 && minutePart > 0) return `${hourPart}h ${minutePart}m ${direction}`;
  if (hourPart > 0) return `${hourPart}h ${direction}`;
  return `${minutePart}m ${direction}`;
}

export function formatNightLength(hours: number | null): string {
  if (hours == null) return '-';
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const hourPart = Math.trunc(totalMinutes / 60);
  const minutePart = totalMinutes % 60;
  if (minutePart === 0) return `${hourPart}h`;
  return `${hourPart}h ${minutePart}m`;
}

export function formatNightDelta(hours: number | null): string {
  if (hours == null) return 'vs 7-night avg';
  if (Math.abs(hours) <= 0.008) return 'same length';
  const totalMinutes = Math.round(Math.abs(hours) * 60);
  const hourPart = Math.trunc(totalMinutes / 60);
  const minutePart = totalMinutes % 60;
  const direction = hours > 0 ? 'longer' : 'shorter';
  if (hourPart > 0 && minutePart > 0) return `${hourPart}h ${minutePart}m ${direction}`;
  if (hourPart > 0) return `${hourPart}h ${direction}`;
  return `${minutePart}m ${direction}`;
}
