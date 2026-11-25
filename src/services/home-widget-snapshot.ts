// pure snapshot builder for the android home-screen widgets. mirrors what the
// dashboard shows (last night = newest valid session, 7-night average = the
// "avg sleep" pill) so the widget and the app never disagree.
// no react or react-native imports (the device clock is passed in):
// unit-tested in node.
import type { HomeWidgetColors, HomeWidgetProps } from '../../widgets/home-widget-props';
import { DEFAULT_SETTINGS, type SleepSession, type ThemeMode, type ThemePalette } from '../domain/models';
import {
  formatClockTime,
  formatDurationHm,
  timeOffsetFromMinutes,
  timeOffsetOfInstant,
} from '../domain/metrics/chart-data';
import {
  averageWeekDurationSeconds,
  formatAvgDuration,
  processWeekData,
  trackedDataPoints,
} from '../domain/metrics/week-data';
import { sessionDurationSeconds, sleepGoalSeconds } from '../domain/session-rules';
import { PALETTES, type AppTheme } from '../theme/palettes';
import { formatMinuteTime, formatTime } from '../utils/locale-format';

export interface HomeWidgetInput {
  activeSession: SleepSession | null;
  // valid completed sessions, newest first (the sleep store's `sessions`)
  sessions: readonly SleepSession[];
  optimalSleepMinutes: number;
  optimalWakeMinutes: number;
  themeMode: ThemeMode;
  themePalette: ThemePalette;
  // the device's 12/24-hour setting and locale (locale-format deviceClock),
  // like the app and the notification; omitted: swift's fixed "h:mm a"
  clock?: { locale?: string; hour12?: boolean };
}

// swift ProfileWidgetEntryView tints the idle moon `.teal`; the port uses the
// twilight accent (#00D4FF) like the live activity. on the sunset gradient
// teal loses contrast, so light mode uses the sunset accent instead
const MOON_TEAL = '#00d4ff';

// one drawable per background gradient (plugins/android/drawable)
const SKY_DRAWABLE: Record<AppTheme['name'], string> = {
  twilight: 'twilight_widget_sky_twilight',
  amethyst: 'twilight_widget_sky_amethyst',
  sunset: 'twilight_widget_sky_sunset',
};

export function widgetColors(theme: AppTheme): HomeWidgetColors {
  const light = theme.name === 'sunset';
  return {
    sky: SKY_DRAWABLE[theme.name],
    textPrimary: theme.textPrimary,
    textSecondary: theme.textSecondary,
    accent: theme.accent,
    moon: light ? theme.accent : MOON_TEAL,
    action: theme.actionPrimary,
    actionText: '#ffffff',
    track: light ? 'rgba(45, 27, 46, 0.14)' : 'rgba(255, 255, 255, 0.14)',
    halo: light ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.12)',
  };
}

// a fully specified clock never reads the device (node-safe)
function fixedClock(clock: HomeWidgetInput['clock']): Required<NonNullable<HomeWidgetInput['clock']>> | null {
  return clock?.hour12 == null ? null : { locale: clock.locale ?? 'en-US', hour12: clock.hour12 };
}

function minuteTime(minutes: number, clock: HomeWidgetInput['clock']): string {
  const fixed = fixedClock(clock);
  return fixed ? formatMinuteTime(minutes, fixed) : formatClockTime(timeOffsetFromMinutes(minutes));
}

function startedAt(session: SleepSession, clock: HomeWidgetInput['clock']): string {
  const fixed = fixedClock(clock);
  return fixed
    ? formatTime(session.startTime, { ...fixed, timeZone: session.startTimeZone })
    : formatClockTime(timeOffsetOfInstant(session.startTime, session.startTimeZone));
}

export function buildHomeWidgetSnapshot(
  input: HomeWidgetInput,
  nowMs: number = Date.now()
): HomeWidgetProps {
  const { activeSession, sessions, optimalSleepMinutes, optimalWakeMinutes } = input;
  const goalSeconds = sleepGoalSeconds(optimalSleepMinutes, optimalWakeMinutes);
  const goal = formatDurationHm(goalSeconds);

  const last = sessions.length > 0 ? sessions[0] : null;
  const lastSeconds = last ? sessionDurationSeconds(last, nowMs) : 0;
  const progress = last ? Math.min(1, Math.max(0, lastSeconds / goalSeconds)) : 0;
  let lastNightCaption = 'Track your first night';
  if (last) {
    lastNightCaption =
      lastSeconds >= goalSeconds
        ? 'Goal reached'
        : `${Math.floor(progress * 100)}% of ${goal} goal`;
  }

  const week = processWeekData(sessions);
  const tracked = trackedDataPoints(week).length;
  const avg = formatAvgDuration(averageWeekDurationSeconds(week));

  // the palette picker only applies to dark mode; light mode is always sunset
  const night = PALETTES[input.themePalette];

  return {
    sleeping: activeSession != null,
    sessionStartMs: activeSession?.startTime ?? 0,
    startedAt: activeSession ? startedAt(activeSession, input.clock) : '',
    bedtime: minuteTime(optimalSleepMinutes, input.clock),
    wake: minuteTime(optimalWakeMinutes, input.clock),
    goal,
    lastNight: last ? formatDurationHm(lastSeconds) : '',
    lastNightProgress: progress,
    lastNightCaption,
    average: tracked > 0 ? `${avg.hours}h ${avg.minutes}m` : '',
    averageCaption: `${tracked} of 7 nights`,
    scheme: input.themeMode,
    day: widgetColors(PALETTES.sunset),
    night: widgetColors(night),
  };
}

// what a widget shows before the app has ever published (fresh install,
// cleared storage): default schedule, no history, awake
export function initialHomeWidgetProps(): HomeWidgetProps {
  return buildHomeWidgetSnapshot(
    {
      activeSession: null,
      sessions: [],
      optimalSleepMinutes: DEFAULT_SETTINGS.optimalSleepMinutes,
      optimalWakeMinutes: DEFAULT_SETTINGS.optimalWakeMinutes,
      themeMode: DEFAULT_SETTINGS.themeMode,
      themePalette: DEFAULT_SETTINGS.themePalette,
    },
    0
  );
}
