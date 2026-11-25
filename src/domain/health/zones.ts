// time zone mapping between iana ids and health connect offsets (docs/health-connect.md 3.5)
import { dayKey, zonedParts } from '../session-rules';

export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// utc offset of `zone` at `instantMs` in seconds; null for an unknown zone
export function offsetSecondsAt(zone: string, instantMs: number): number | null {
  if (!isValidTimeZone(zone)) return null;
  const p = zonedParts(instantMs, zone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((wall - Math.floor(instantMs / 1000) * 1000) / 1000);
}

// representative zones for offsets that are not whole hours (3.5 table)
const FRACTIONAL_OFFSET_ZONES: Record<number, string[]> = {
  [3 * 3600 + 1800]: ['Asia/Tehran'],
  [4 * 3600 + 1800]: ['Asia/Kabul'],
  [5 * 3600 + 1800]: ['Asia/Kolkata'],
  [5 * 3600 + 2700]: ['Asia/Kathmandu'],
  [6 * 3600 + 1800]: ['Asia/Yangon'],
  [8 * 3600 + 2700]: ['Australia/Eucla'],
  [9 * 3600 + 1800]: ['Australia/Darwin', 'Australia/Adelaide'],
  [10 * 3600 + 1800]: ['Australia/Adelaide'],
  [-(3 * 3600 + 1800)]: ['America/St_Johns'],
  [-(2 * 3600 + 1800)]: ['America/St_Johns'],
  [-(9 * 3600 + 1800)]: ['Pacific/Marquesas'],
  [12 * 3600 + 2700]: ['Pacific/Chatham'],
  [13 * 3600 + 2700]: ['Pacific/Chatham'],
};

function wholeHourZone(offsetSec: number): string | null {
  const hours = offsetSec / 3600;
  if (hours === 0) return 'Etc/GMT';
  if (hours < -12 || hours > 14) return null;
  // posix sign inversion: +02:00 is Etc/GMT-2
  return `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`;
}

// first candidate whose offset at that instant matches: device zone, then
// Etc/GMT for whole hours or the fractional table, else the device zone
export function zoneForOffset(offsetSec: number | null, instantMs: number, deviceZone: string): string {
  if (offsetSec == null) return deviceZone;
  const candidates = [deviceZone];
  if (offsetSec % 3600 === 0) {
    const zone = wholeHourZone(offsetSec);
    if (zone) candidates.push(zone);
  } else {
    candidates.push(...(FRACTIONAL_OFFSET_ZONES[offsetSec] ?? []));
  }
  return candidates.find((zone) => offsetSecondsAt(zone, instantMs) === offsetSec) ?? deviceZone;
}

// local wake date of a night: the end instant shifted by the end offset, so
// the key does not change when the device travels (fixes swift defect 3)
export function wakeDayKey(endMs: number, endOffsetSec: number | null, deviceZone: string): string {
  if (endOffsetSec == null) return dayKey(zonedParts(endMs, deviceZone));
  const shifted = new Date(endMs + endOffsetSec * 1000);
  return dayKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}
