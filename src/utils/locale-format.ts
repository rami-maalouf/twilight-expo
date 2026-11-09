// locale-aware time and date formatting helpers respecting 12h/24h cycles and device locale

export interface FormatTimeOptions {
  timeZone?: string;
  hour12?: boolean;
  locale?: string;
}

export function formatTime(epochMs: number, options?: FormatTimeOptions): string {
  const d = new Date(epochMs);
  const intlOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
  };
  if (options?.timeZone) {
    intlOpts.timeZone = options.timeZone;
  }
  if (options?.hour12 !== undefined) {
    intlOpts.hour12 = options.hour12;
  }
  return d
    .toLocaleTimeString(options?.locale, intlOpts)
    .replace(/\u202f/g, ' ');
}

export function formatMinuteTime(minutes: number, options?: FormatTimeOptions): string {
  const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
  d.setUTCHours(Math.trunc(minutes / 60), minutes % 60, 0, 0);
  const intlOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  };
  if (options?.hour12 !== undefined) {
    intlOpts.hour12 = options.hour12;
  }
  return d
    .toLocaleTimeString(options?.locale, intlOpts)
    .replace(/\u202f/g, ' ');
}

export function formatDayDate(
  date: Date,
  options?: { locale?: string; timeZone?: string }
): string {
  return date.toLocaleDateString(options?.locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: options?.timeZone,
  });
}

export function formatDashboardDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
