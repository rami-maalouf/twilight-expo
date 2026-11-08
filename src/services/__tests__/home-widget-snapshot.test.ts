// android home widget snapshot: awake/sleeping state, dashboard parity for
// last night and the 7-night average, goal captions, palette resolution
import type { SleepSession } from '../../domain/models';
import { PALETTES } from '../../theme/palettes';
import {
  buildHomeWidgetSnapshot,
  initialHomeWidgetProps,
  widgetColors,
  type HomeWidgetInput,
} from '../home-widget-snapshot';

const TZ = 'America/Denver';
const HOUR = 3600_000;
// 2025-01-15 22:00 in denver (utc-7)
const NIGHT0 = Date.UTC(2025, 0, 16, 5, 0, 0);

function session(id: string, startMs: number, hours: number | null): SleepSession {
  return {
    id,
    tag: 'Sleep Mode',
    startTime: startMs,
    endTime: hours == null ? null : startMs + hours * HOUR,
    startTimeZone: TZ,
    endTimeZone: hours == null ? null : TZ,
    createdAt: startMs,
    updatedAt: startMs,
  };
}

function input(overrides: Partial<HomeWidgetInput> = {}): HomeWidgetInput {
  return {
    activeSession: null,
    sessions: [],
    optimalSleepMinutes: 22 * 60,
    optimalWakeMinutes: 7 * 60,
    themeMode: 'dark',
    themePalette: 'twilight',
    ...overrides,
  };
}

describe('buildHomeWidgetSnapshot', () => {
  test('fresh install: awake, targets and goal, empty history copy', () => {
    const props = buildHomeWidgetSnapshot(input(), NIGHT0);
    expect(props.sleeping).toBe(false);
    expect(props.sessionStartMs).toBe(0);
    expect(props.startedAt).toBe('');
    expect(props.bedtime).toBe('10:00 PM');
    expect(props.wake).toBe('7:00 AM');
    expect(props.goal).toBe('9h');
    expect(props.lastNight).toBe('');
    expect(props.lastNightProgress).toBe(0);
    expect(props.lastNightCaption).toBe('Track your first night');
    expect(props.average).toBe('');
    expect(props.averageCaption).toBe('0 of 7 nights');
  });

  test('active session: sleeping with start epoch and its wall-clock start', () => {
    const start = NIGHT0 + 42 * 60_000;
    const props = buildHomeWidgetSnapshot(input({ activeSession: session('a', start, null) }), start);
    expect(props.sleeping).toBe(true);
    expect(props.sessionStartMs).toBe(start);
    expect(props.startedAt).toBe('10:42 PM');
  });

  test('last night is the newest session, with progress toward the goal', () => {
    const sessions = [
      session('new', NIGHT0 + 24 * HOUR, 7.2),
      session('old', NIGHT0, 8),
    ];
    const props = buildHomeWidgetSnapshot(input({ sessions }), NIGHT0 + 40 * HOUR);
    expect(props.lastNight).toBe('7h 12min');
    expect(props.lastNightProgress).toBeCloseTo(0.8);
    expect(props.lastNightCaption).toBe('80% of 9h goal');
    // dashboard "avg sleep" pill: mean of tracked nights in the 7-day window
    expect(props.average).toBe('7h 36m');
    expect(props.averageCaption).toBe('2 of 7 nights');
  });

  test('meeting the goal clamps progress and says so', () => {
    const props = buildHomeWidgetSnapshot(
      input({ sessions: [session('long', NIGHT0, 10)] }),
      NIGHT0 + 12 * HOUR
    );
    expect(props.lastNightProgress).toBe(1);
    expect(props.lastNightCaption).toBe('Goal reached');
  });

  test('goal wraps past midnight and follows settings', () => {
    const props = buildHomeWidgetSnapshot(
      input({ optimalSleepMinutes: 23 * 60 + 30, optimalWakeMinutes: 6 * 60 + 15 }),
      NIGHT0
    );
    expect(props.bedtime).toBe('11:30 PM');
    expect(props.wake).toBe('6:15 AM');
    expect(props.goal).toBe('6h 45min');
  });

  test('display mode passes through; night colors follow the palette, day is sunset', () => {
    const twilight = buildHomeWidgetSnapshot(input({ themeMode: 'system' }), NIGHT0);
    expect(twilight.scheme).toBe('system');
    expect(twilight.night.sky).toBe('twilight_widget_sky_twilight');
    expect(twilight.night.accent).toBe(PALETTES.twilight.accent);
    expect(twilight.day.sky).toBe('twilight_widget_sky_sunset');
    expect(twilight.day.textPrimary).toBe(PALETTES.sunset.textPrimary);

    const amethyst = buildHomeWidgetSnapshot(
      input({ themeMode: 'light', themePalette: 'amethyst' }),
      NIGHT0
    );
    expect(amethyst.scheme).toBe('light');
    expect(amethyst.night.sky).toBe('twilight_widget_sky_amethyst');
    expect(amethyst.night.action).toBe(PALETTES.amethyst.actionPrimary);
  });

  test('snapshot is json-serializable (stored natively by expo-widgets)', () => {
    const props = buildHomeWidgetSnapshot(
      input({ sessions: [session('n', NIGHT0, 8)], activeSession: session('a', NIGHT0 + 30 * HOUR, null) }),
      NIGHT0 + 31 * HOUR
    );
    expect(JSON.parse(JSON.stringify(props))).toEqual(props);
  });
});

describe('initialHomeWidgetProps', () => {
  test('pre-launch widgets show the default schedule, awake, in night sky', () => {
    const props = initialHomeWidgetProps();
    expect(props.sleeping).toBe(false);
    expect(props.bedtime).toBe('10:00 PM');
    expect(props.wake).toBe('7:00 AM');
    expect(props.lastNight).toBe('');
    expect(props.scheme).toBe('dark');
    expect(props.night.sky).toBe('twilight_widget_sky_twilight');
  });
});

describe('widgetColors', () => {
  test('teal moon at night, sunset accent by day, white action text everywhere', () => {
    expect(widgetColors(PALETTES.twilight).moon).toBe('#00d4ff');
    expect(widgetColors(PALETTES.amethyst).moon).toBe('#00d4ff');
    expect(widgetColors(PALETTES.sunset).moon).toBe(PALETTES.sunset.accent);
    for (const theme of Object.values(PALETTES)) {
      const colors = widgetColors(theme);
      expect(colors.actionText).toBe('#ffffff');
      expect(colors.action).toBe(theme.actionPrimary);
    }
  });
});
