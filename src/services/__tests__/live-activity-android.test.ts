// android session notification decisions (live-activity.android.ts) over a
// fake of the native module that behaves like TwilightSessionNotification.kt:
// one notification, a swipe remembered by key, cancel(null) forgets it
import type { SleepSession } from '../../domain/models';

const mockSettings: Record<string, unknown> = {};

jest.mock('../../data/app-db', () => ({
  settingsStore: {
    get: (key: string) => mockSettings[key],
    set: (key: string, value: unknown) => {
      mockSettings[key] = value;
    },
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
  requestPermissionsAsync: jest.fn(),
}));

interface Spec {
  kind: 'sleep' | 'winddown';
  key: string;
  [field: string]: unknown;
}

const mockNative = {
  shown: null as Spec | null,
  dismissedKey: null as string | null,
  posts: [] as Spec[],
  // the user swipes the notification away (deleteIntent -> markDismissed)
  swipe() {
    mockNative.dismissedKey = mockNative.shown?.key ?? null;
    mockNative.shown = null;
  },
};

jest.mock('../../../modules/twilight-widget-actions/session-notification', () => ({
  postSessionNotification: (spec: Spec) => {
    if (mockNative.dismissedKey === spec.key) return 'dismissed';
    mockNative.shown = spec;
    mockNative.posts.push(spec);
    return 'posted';
  },
  cancelSessionNotification: (kind?: string) => {
    if (kind && mockNative.shown && mockNative.shown.kind !== kind) return;
    mockNative.shown = null;
    if (!kind) mockNative.dismissedKey = null;
  },
  activeSessionNotification: () => (mockNative.shown ? { kind: mockNative.shown.kind, key: mockNative.shown.key } : null),
  canPostSessionNotification: () => true,
}));

// eslint-disable-next-line import/first
import { endSleepActivity, reconcileLiveActivity, startSleepActivity } from '../live-activity.android';

const START = Date.UTC(2025, 0, 16, 6, 0, 0);
const DAY = 24 * 3600_000;

function session(startTime: number): SleepSession {
  return {
    id: `s${startTime}`,
    tag: 'Sleep Mode',
    startTime,
    endTime: null,
    startTimeZone: 'UTC',
    endTimeZone: null,
    createdAt: startTime,
    updatedAt: startTime,
  };
}

beforeEach(() => {
  mockNative.shown = null;
  mockNative.dismissedKey = null;
  mockNative.posts = [];
  Object.assign(mockSettings, {
    liveActivityEnabled: true,
    liveActivityId: null,
    optimalSleepMinutes: 23 * 60,
    optimalWakeMinutes: 7 * 60,
  });
});

describe('android sleep notification', () => {
  test('a goal change reposts the shown notification with the new goal', async () => {
    await startSleepActivity(session(START));
    mockSettings.optimalWakeMinutes = 8 * 60;
    await reconcileLiveActivity(session(START));
    expect(mockNative.posts).toHaveLength(2);
    expect(mockNative.shown).toMatchObject({ key: `sleep:${START}`, goalSeconds: 9 * 3600 });
    expect(mockSettings.liveActivityId).toBe('sleep');
  });

  test('a swiped notification stays away for its session: relaunch and goal changes do not bring it back', async () => {
    await startSleepActivity(session(START));
    mockNative.swipe();

    await reconcileLiveActivity(session(START));
    mockSettings.optimalWakeMinutes = 8 * 60;
    await reconcileLiveActivity(session(START));

    expect(mockNative.shown).toBeNull();
    expect(mockNative.posts).toHaveLength(1);
    expect(mockSettings.liveActivityId).toBeNull();
  });

  test('the next session shows again after a swipe', async () => {
    await startSleepActivity(session(START));
    mockNative.swipe();
    await endSleepActivity();
    await startSleepActivity(session(START + DAY));
    expect(mockNative.shown).toMatchObject({ key: `sleep:${START + DAY}` });
  });

  test('turning the setting off and on shows a swiped notification again', async () => {
    await startSleepActivity(session(START));
    mockNative.swipe();
    mockSettings.liveActivityEnabled = false;
    await reconcileLiveActivity(session(START));
    mockSettings.liveActivityEnabled = true;
    await reconcileLiveActivity(session(START));
    expect(mockNative.shown).toMatchObject({ key: `sleep:${START}` });
    expect(mockSettings.liveActivityId).toBe('sleep');
  });

  test('no session removes a leftover sleep notification', async () => {
    await startSleepActivity(session(START));
    await reconcileLiveActivity(null);
    expect(mockNative.shown).toBeNull();
    expect(mockSettings.liveActivityId).toBeNull();
  });
});
