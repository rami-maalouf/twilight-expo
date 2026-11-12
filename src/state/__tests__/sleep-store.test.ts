// sleep session state: toggle round-trip, 5-minute joke path, restore
import { memoryDb } from '../../../tests/helpers/memory-db';
import { migrate } from '../../data/db';
import { SessionRepo } from '../../data/session-repo';
import { createSleepStore } from '../sleep-store';

const T0 = Date.UTC(2025, 0, 15, 5, 0, 0);
const HOURS = 3600_000;

function setup() {
  const db = memoryDb();
  migrate(db);
  const repo = new SessionRepo(db);
  const store = createSleepStore(repo, () => 'America/Denver');
  return { repo, store };
}

describe('sleep store', () => {
  test('toggle starts then ends a session, persisting it as valid', () => {
    const { store } = setup();
    const startResult = store.getState().toggleSleep(T0);
    expect(startResult.joke).toBeNull();
    expect(store.getState().activeSession?.tag).toBe('Sleep Mode');

    const endResult = store.getState().toggleSleep(T0 + 8 * HOURS);
    expect(endResult.joke).toBeNull();
    expect(store.getState().activeSession).toBeNull();
    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().sessions[0].startTimeZone).toBe('America/Denver');
  });

  test('sub-5-minute wake returns a joke and hides the session from lists', () => {
    const { store } = setup();
    store.getState().toggleSleep(T0);
    const result = store.getState().toggleSleep(T0 + 2 * 60_000);
    expect(result.joke).toContain('2 minutes');
    expect(store.getState().sessions).toHaveLength(0);
    expect(store.getState().activeSession).toBeNull();
  });

  test('refresh restores active session from storage (relaunch)', () => {
    const { repo, store } = setup();
    store.getState().toggleSleep(T0);

    // simulate a fresh launch: new store over the same repo
    const reloaded = createSleepStore(repo, () => 'America/Denver');
    reloaded.getState().refresh();
    expect(reloaded.getState().activeSession).not.toBeNull();
    expect(reloaded.getState().activeSession?.startTime).toBe(T0);
  });

  test('delete removes a session from the list', () => {
    const { store } = setup();
    store.getState().toggleSleep(T0);
    store.getState().toggleSleep(T0 + 8 * HOURS);
    const id = store.getState().sessions[0].id;
    store.getState().deleteSession(id);
    expect(store.getState().sessions).toHaveLength(0);
  });

  test('resetAllSessions removes completed and active sessions', () => {
    const { store } = setup();
    store.getState().toggleSleep(T0);
    store.getState().toggleSleep(T0 + 8 * HOURS);
    store.getState().toggleSleep(T0 + 20 * HOURS);
    expect(store.getState().sessions).toHaveLength(1);
    expect(store.getState().activeSession).not.toBeNull();

    store.getState().resetAllSessions();
    expect(store.getState().sessions).toHaveLength(0);
    expect(store.getState().activeSession).toBeNull();
  });

  test('completed-night changes notify health sync; starting a session does not', () => {
    const db = memoryDb();
    migrate(db);
    const repo = new SessionRepo(db);
    const changed = jest.fn();
    const store = createSleepStore(repo, () => 'America/Denver', changed);
    store.getState().toggleSleep(T0);
    expect(changed).not.toHaveBeenCalled();
    store.getState().toggleSleep(T0 + 8 * HOURS);
    expect(changed).toHaveBeenCalledTimes(1);
    const input = { startTime: T0 + 24 * HOURS, endTime: T0 + 32 * HOURS, startTimeZone: 'UTC', endTimeZone: 'UTC' };
    store.getState().createManualLog(input);
    const id = store.getState().sessions[0].id;
    store.getState().updateSession(id, { ...input, endTime: T0 + 31 * HOURS });
    store.getState().deleteSession(id);
    expect(changed).toHaveBeenCalledTimes(4);
    store.getState().resetAllSessions();
    expect(changed).toHaveBeenCalledTimes(5);
  });
});
