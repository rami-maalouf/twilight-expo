// twilight://sleep/start|stop: parsing, swift error copy, idempotent actions,
// the one-slot pending queue
import { memoryDb } from '../../../tests/helpers/memory-db';
import { migrate } from '../../data/db';
import { SessionRepo } from '../../data/session-repo';
import { createSleepStore } from '../../state/sleep-store';
import {
  parseSleepLink,
  freshWidgetAction,
  NOTIFICATION_ACTION_MAX_AGE_MS,
  performSleepLinkAction,
  planNotificationAction,
  queueLaunchSleepLink,
  queueSleepLinkAction,
  SLEEP_LINK_MESSAGES,
  SLEEP_START_URL,
  SLEEP_STOP_URL,
  subscribeSleepLinkActions,
  takeSleepLinkAction,
  WIDGET_ACTION_MAX_AGE_MS,
} from '../sleep-links';

const T0 = Date.UTC(2025, 0, 15, 5, 0, 0);
const HOUR = 3600_000;

function setup() {
  const db = memoryDb();
  migrate(db);
  const repo = new SessionRepo(db);
  return { repo, store: createSleepStore(repo, () => 'America/Denver') };
}

describe('parseSleepLink', () => {
  test.each([
    [SLEEP_START_URL, 'start'],
    [SLEEP_STOP_URL, 'stop'],
    ['twilight:///sleep/start', 'start'],
    ['exp+twilight://sleep/stop', 'stop'],
    ['/sleep/start', 'start'],
    ['sleep/stop', 'stop'],
    ['twilight://sleep/start?source=widget', 'start'],
    ['twilight://SLEEP/Stop/', 'stop'],
  ])('%s -> %s', (url, expected) => {
    expect(parseSleepLink(url)).toBe(expected);
  });

  test.each([
    'twilight://',
    '/',
    'twilight://sleep',
    'twilight://sleep/toggle',
    'twilight://settings/start',
    '/(tabs)/logs',
    'https://twilight.orbitlabs.studio',
  ])('%s is not a sleep link', (url) => {
    expect(parseSleepLink(url)).toBeNull();
  });
});

describe('performSleepLinkAction', () => {
  test('start then stop runs the dashboard toggle path', () => {
    const { store } = setup();
    const started = performSleepLinkAction('start', true, store, T0);
    expect(started.message).toBeNull();
    expect(started.result?.started).not.toBeNull();
    expect(store.getState().activeSession).not.toBeNull();

    const stopped = performSleepLinkAction('stop', true, store, T0 + 8 * HOUR);
    expect(stopped.message).toBeNull();
    expect(stopped.result?.ended?.endTime).toBe(T0 + 8 * HOUR);
    expect(store.getState().activeSession).toBeNull();
    expect(store.getState().sessions).toHaveLength(1);
  });

  test('start while sleeping and stop while awake only explain (swift copy)', () => {
    const { store } = setup();
    expect(performSleepLinkAction('stop', true, store, T0)).toEqual({
      message: SLEEP_LINK_MESSAGES.notActive,
      result: null,
    });
    performSleepLinkAction('start', true, store, T0);
    const sessionId = store.getState().activeSession?.id;
    expect(performSleepLinkAction('start', true, store, T0 + HOUR)).toEqual({
      message: SLEEP_LINK_MESSAGES.alreadyActive,
      result: null,
    });
    expect(store.getState().activeSession?.id).toBe(sessionId);
  });

  test('short sessions end with the joke alert', () => {
    const { store } = setup();
    performSleepLinkAction('start', true, store, T0);
    const outcome = performSleepLinkAction('stop', true, store, T0 + 60_000);
    expect(outcome.message).toEqual(expect.any(String));
    expect(outcome.message).toBe(outcome.result?.joke);
  });

  test('before onboarding nothing changes', () => {
    const { store } = setup();
    expect(performSleepLinkAction('start', false, store, T0).message).toBe(
      SLEEP_LINK_MESSAGES.notOnboarded
    );
    expect(store.getState().activeSession).toBeNull();
  });

  test('decides on the persisted session, not a stale in-memory one', () => {
    const { repo, store } = setup();
    // another surface started a session behind the store's back
    repo.startSession('Sleep Mode', 'America/Denver', T0);
    expect(store.getState().activeSession).toBeNull();
    expect(performSleepLinkAction('start', true, store, T0 + HOUR).message).toBe(
      SLEEP_LINK_MESSAGES.alreadyActive
    );
  });
});

describe('freshWidgetAction', () => {
  const NOW = Date.UTC(2025, 0, 15, 5);
  test('a widget press from moments ago runs', () => {
    expect(freshWidgetAction({ action: 'start', at: NOW - 3_000 }, NOW)).toBe('start');
    expect(freshWidgetAction({ action: 'stop', at: NOW - WIDGET_ACTION_MAX_AGE_MS }, NOW)).toBe('stop');
  });

  test('late, future-dated, unknown or missing presses are dropped', () => {
    expect(freshWidgetAction(null, NOW)).toBeNull();
    expect(freshWidgetAction({ action: 'stop', at: NOW - WIDGET_ACTION_MAX_AGE_MS - 1 }, NOW)).toBeNull();
    expect(freshWidgetAction({ action: 'start', at: NOW + 60_000 }, NOW)).toBeNull();
    expect(freshWidgetAction({ action: 'toggle', at: NOW }, NOW)).toBeNull();
  });

  test('notification presses are left to planNotificationAction', () => {
    expect(freshWidgetAction({ action: 'stop', at: NOW - 1_000, origin: 'notification' }, NOW)).toBeNull();
    expect(freshWidgetAction({ action: 'stop', at: NOW - 1_000, origin: 'widget' }, NOW)).toBe('stop');
  });
});

describe('planNotificationAction', () => {
  const press = (action: string, at: number) => ({ action, at, origin: 'notification' });

  test('wake up ends the session at the press time, however late js runs', () => {
    const { store } = setup();
    store.getState().toggleSleep(T0);
    const plan = planNotificationAction(press('stop', T0 + 8 * HOUR), store.getState(), T0 + 10 * HOUR);
    expect(plan).toEqual({ action: 'stop', atMs: T0 + 8 * HOUR });
    store.getState().toggleSleep(plan!.atMs);
    expect(store.getState().sessions[0]).toMatchObject({ startTime: T0, endTime: T0 + 8 * HOUR });
  });

  test('wake up needs the session it was pressed for', () => {
    const { store } = setup();
    expect(planNotificationAction(press('stop', T0), store.getState(), T0 + 1_000)).toBeNull();
    store.getState().toggleSleep(T0 + HOUR);
    // pressed before this session started: a stale press from another night
    expect(planNotificationAction(press('stop', T0), store.getState(), T0 + 2 * HOUR)).toBeNull();
  });

  test('start sleep starts at the press time unless a session followed it', () => {
    const { store } = setup();
    expect(planNotificationAction(press('start', T0), store.getState(), T0 + 5_000)).toEqual({
      action: 'start',
      atMs: T0,
    });
    store.getState().toggleSleep(T0 - 8 * HOUR);
    store.getState().toggleSleep(T0 + HOUR);
    expect(planNotificationAction(press('start', T0), store.getState(), T0 + 2 * HOUR)).toBeNull();
    store.getState().toggleSleep(T0 + 3 * HOUR);
    expect(planNotificationAction(press('start', T0), store.getState(), T0 + 3 * HOUR)).toBeNull();
  });

  test('old, future-dated, widget and unknown presses are dropped', () => {
    const { store } = setup();
    store.getState().toggleSleep(T0);
    const state = store.getState();
    const now = T0 + NOTIFICATION_ACTION_MAX_AGE_MS + HOUR;
    expect(planNotificationAction(press('stop', T0 + HOUR - 1), state, now)).toBeNull();
    expect(planNotificationAction(press('stop', T0 + HOUR), state, now)).not.toBeNull();
    expect(planNotificationAction(press('stop', T0 + 60_000), state, T0)).toBeNull();
    expect(planNotificationAction({ action: 'stop', at: T0 + 1, origin: 'widget' }, state, T0 + 2)).toBeNull();
    expect(planNotificationAction({ action: 'stop', at: T0 + 1 }, state, T0 + 2)).toBeNull();
    expect(planNotificationAction(press('toggle', T0 + 1), state, T0 + 2)).toBeNull();
    expect(planNotificationAction(null, state, T0)).toBeNull();
  });

  test('a press a few seconds ahead of the js clock applies now', () => {
    const { store } = setup();
    store.getState().toggleSleep(T0);
    expect(planNotificationAction(press('stop', T0 + HOUR + 2_000), store.getState(), T0 + HOUR)).toEqual({
      action: 'stop',
      atMs: T0 + HOUR,
    });
  });
});

describe('launch link', () => {
  test('the launching url queues once, whichever path reports it first', () => {
    expect(queueLaunchSleepLink(null)).toBe(false);
    // expo-router's timeout fallback reports the root url
    expect(queueLaunchSleepLink('twilight:///')).toBe(false);
    expect(queueLaunchSleepLink(SLEEP_STOP_URL)).toBe(true);
    expect(takeSleepLinkAction()).toBe('stop');
    // the same launch url arriving through Linking.getInitialURL()
    expect(queueLaunchSleepLink(SLEEP_STOP_URL)).toBe(false);
    expect(takeSleepLinkAction()).toBeNull();
  });
});

describe('pending queue', () => {
  test('one slot: the newest link wins and is consumed once', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSleepLinkActions(listener);
    queueSleepLinkAction('start');
    queueSleepLinkAction('stop');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(takeSleepLinkAction()).toBe('stop');
    expect(takeSleepLinkAction()).toBeNull();
    unsubscribe();
    queueSleepLinkAction('start');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(takeSleepLinkAction()).toBe('start');
  });
});
