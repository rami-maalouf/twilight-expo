// times and dates that swift renders with DateFormatter styles or
// Text(style:) (.short time, .date), which follow the device locale and its
// 12/24-hour setting. hermes' Intl only knows the locale, not android's
// "use 24-hour format" switch, so the hour cycle comes from expo-localization
// (DateFormat.is24HourFormat on android, the locale's hour cycle on ios).
// places where swift hard-codes "h:mm a" (tips, chart labels, the dial) keep
// their own fixed formatters.
import { getCalendars, getLocales } from 'expo-localization';

export interface ClockOptions {
  timeZone?: string;
  // true: 12-hour with a day period; false: 24-hour; undefined: device setting
  hour12?: boolean;
  // bcp 47 tag; undefined: device locale
  locale?: string;
}

export function deviceClock(): { locale?: string; hour12?: boolean } {
  try {
    const uses24 = getCalendars()[0]?.uses24hourClock;
    return {
      locale: getLocales()[0]?.languageTag ?? undefined,
      hour12: uses24 == null ? undefined : !uses24,
    };
  } catch {
    return {};
  }
}

function resolve(options?: ClockOptions) {
  const device = options?.locale !== undefined && options?.hour12 !== undefined ? {} : deviceClock();
  return {
    locale: options?.locale ?? device.locale,
    hour12: options?.hour12 ?? device.hour12,
  };
}

// narrow no-break spaces (icu 72+) read as odd gaps in rows; use plain spaces
function tidy(text: string): string {
  return text.replace(/[  ]/g, ' ');
}

// DateFormatter timeStyle .short: "10:00 PM" / "22:00"
export function formatTime(epochMs: number, options?: ClockOptions): string {
  const { locale, hour12 } = resolve(options);
  const intl: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  if (options?.timeZone) intl.timeZone = options.timeZone;
  if (hour12 !== undefined) intl.hour12 = hour12;
  return tidy(new Date(epochMs).toLocaleTimeString(locale, intl));
}

// a wall-clock minute of the day (0..1439) in the .short time style
export function formatMinuteTime(minutes: number, options?: Omit<ClockOptions, 'timeZone'>): string {
  const wrapped = ((Math.trunc(minutes) % 1440) + 1440) % 1440;
  const epoch = Date.UTC(2000, 0, 1, Math.trunc(wrapped / 60), wrapped % 60);
  return formatTime(epoch, { ...options, timeZone: 'UTC' });
}

// swift DateFormatters.formatDay rendered by ios: "Wed, Jul 15"
export function formatDayDate(date: Date, options?: { locale?: string; timeZone?: string }): string {
  const locale = options?.locale ?? deviceClock().locale;
  return tidy(
    date.toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: options?.timeZone,
    })
  );
}

// Text(Date(), style: .date): "November 11, 2026"
export function formatDashboardDate(date: Date, locale?: string): string {
  return tidy(
    date.toLocaleDateString(locale ?? deviceClock().locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  );
}

// the android date chip: "Nov 11, 2026"
export function formatShortDate(date: Date, options?: { locale?: string; timeZone?: string }): string {
  return tidy(
    date.toLocaleDateString(options?.locale ?? deviceClock().locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: options?.timeZone,
    })
  );
}
