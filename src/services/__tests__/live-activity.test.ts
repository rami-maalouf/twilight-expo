// ios live activity reconcile (live-activity.ts) over a fake activity factory:
// a goal or bedtime change must reach a running activity in place
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

interface FakeInstance {
  props: Record<string, unknown>;
  ended: boolean;
  update: jest.Mock;
  end: jest.Mock;
}

const mockRunning: FakeInstance[] = [];

function mockInstance(props: Record<string, unknown>): FakeInstance {
  const instance: FakeInstance = {
    props,
    ended: false,
    update: jest.fn(async (next: Record<string, unknown>) => {
      instance.props = next;
    }),
    end: jest.fn(async () => {
      instance.ended = true;
      mockRunning.splice(mockRunning.indexOf(instance), 1);
    }),
  };
  return instance;
}

jest.mock('../../../widgets/sleep-activity', () => ({
  __esModule: true,
  default: {
    getInstances: () => [...mockRunning],
    start: jest.fn((props: Record<string, unknown>) => {
      const instance = mockInstance(props);
      mockRunning.push(instance);
      return instance;
    }),
  },
}));

// eslint-disable-next-line import/first
import { reconcileLiveActivity, startSleepActivity } from '../live-activity';

const START = Date.UTC(2025, 0, 16, 6, 0, 0);
const session: SleepSession = {
  id: 's1',
  tag: 'Sleep Mode',
  startTime: START,
  endTime: null,
  startTimeZone: 'UTC',
  endTimeZone: null,
  createdAt: START,
  updatedAt: START,
};

beforeEach(() => {
  mockRunning.length = 0;
  Object.assign(mockSettings, {
    liveActivityEnabled: true,
    liveActivityId: null,
    optimalSleepMinutes: 23 * 60,
    optimalWakeMinutes: 7 * 60,
  });
});

describe('ios reconcileLiveActivity', () => {
  test('a goal change while asleep updates the running activity in place', async () => {
    await startSleepActivity(session);
    expect(mockRunning).toHaveLength(1);
    expect(mockRunning[0].props).toMatchObject({ mode: 'sleep', goalSeconds: 8 * 3600 });

    mockSettings.optimalWakeMinutes = 8 * 60;
    await reconcileLiveActivity(session);

    expect(mockRunning).toHaveLength(1);
    expect(mockRunning[0].update).toHaveBeenCalledTimes(1);
    expect(mockRunning[0].props).toMatchObject({ mode: 'sleep', startTimeMs: START, goalSeconds: 9 * 3600 });
    expect(mockSettings.liveActivityId).toBe('sleep');
  });

  test('restores a missing activity on relaunch', async () => {
    mockSettings.liveActivityId = 'sleep';
    await reconcileLiveActivity(session);
    expect(mockRunning).toHaveLength(1);
    expect(mockRunning[0].props).toMatchObject({ mode: 'sleep', startTimeMs: START });
  });

  test('keeps exactly one activity', async () => {
    mockRunning.push(mockInstance({ mode: 'sleep' }), mockInstance({ mode: 'sleep' }));
    await reconcileLiveActivity(session);
    expect(mockRunning).toHaveLength(1);
    expect(mockRunning[0].props).toMatchObject({ startTimeMs: START });
  });

  test('no session ends a leftover sleep activity; the toggle off ends any', async () => {
    await startSleepActivity(session);
    await reconcileLiveActivity(null);
    expect(mockRunning).toHaveLength(0);
    expect(mockSettings.liveActivityId).toBeNull();

    await startSleepActivity(session);
    mockSettings.liveActivityEnabled = false;
    await reconcileLiveActivity(session);
    expect(mockRunning).toHaveLength(0);
  });
});
