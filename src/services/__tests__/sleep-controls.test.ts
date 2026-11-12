// the android tile / launcher shortcut mirror follows every session change once
import { memoryDb } from '../../../tests/helpers/memory-db';
import { migrate } from '../../data/db';
import { SessionRepo } from '../../data/session-repo';
import { createSleepStore } from '../../state/sleep-store';
import { mirrorSleepControls } from '../sleep-controls';

const T0 = Date.UTC(2025, 0, 15, 5, 0, 0);
const HOURS = 3600_000;

function setup() {
  const db = memoryDb();
  migrate(db);
  const store = createSleepStore(new SessionRepo(db), () => 'UTC');
  const publish = jest.fn();
  return { store, publish };
}

describe('mirrorSleepControls', () => {
  test('publishes the current state once when installed', () => {
    const { store, publish } = setup();
    mirrorSleepControls(store, publish);
    expect(publish.mock.calls).toEqual([[null]]);
  });

  test('publishes the session start, then null when it ends', () => {
    const { store, publish } = setup();
    mirrorSleepControls(store, publish);
    store.getState().toggleSleep(T0);
    store.getState().toggleSleep(T0 + 8 * HOURS);
    expect(publish.mock.calls).toEqual([[null], [T0], [null]]);
  });

  test('a session already running at launch is published with its start', () => {
    const { store, publish } = setup();
    store.getState().toggleSleep(T0);
    mirrorSleepControls(store, publish);
    expect(publish.mock.calls).toEqual([[T0]]);
  });

  test('changes that keep the session state do not republish', () => {
    const { store, publish } = setup();
    mirrorSleepControls(store, publish);
    store.getState().refresh();
    store.getState().createManualLog({
      startTime: T0 - 24 * HOURS,
      endTime: T0 - 16 * HOURS,
      startTimeZone: 'UTC',
      endTimeZone: 'UTC',
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test('a failing publish does not break the store and is retried on the next change', () => {
    const { store, publish } = setup();
    publish.mockImplementationOnce(() => {
      throw new Error('native gone');
    });
    mirrorSleepControls(store, publish);
    expect(() => store.getState().toggleSleep(T0)).not.toThrow();
    expect(publish.mock.calls).toEqual([[null], [T0]]);
  });

  test('resync republishes an unchanged state (the native side flipped the mirror behind js)', () => {
    const { store, publish } = setup();
    store.getState().toggleSleep(T0);
    const mirror = mirrorSleepControls(store, publish);
    mirror.resync();
    mirror.resync();
    expect(publish.mock.calls).toEqual([[T0], [T0], [T0]]);
  });

  test('unsubscribes', () => {
    const { store, publish } = setup();
    const { stop } = mirrorSleepControls(store, publish);
    stop();
    store.getState().toggleSleep(T0);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
