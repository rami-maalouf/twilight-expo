// connection state machine and copy (docs/health-connect.md 5.1-5.3); ports the
// state rules of AppleHealthSettingsView and AppleHealthOnboardingStepView
import {
  canPullFromHealthConnect,
  connectionState,
  type ConnectionInput,
  type HcConnectionState,
  heldDeletionBody,
  heldDeletionTitle,
  heldRemovalPrompt,
  heroSubtitle,
  isConnectionVisible,
  lastSyncedLabel,
  onboardingCopy,
  onboardingPrimaryAction,
  onboardingState,
  rowSummary,
  screenPrimaryAction,
  screenPrimaryTitle,
  showsDisableAction,
  statusTips,
  TIP_COPY,
} from '../connection-state';
import { READ_WINDOW_HINT } from '../pull-result';

function input(opts: Partial<ConnectionInput> = {}): ConnectionInput {
  return {
    availability: 'available',
    read: false,
    write: false,
    history: false,
    historyFeatureAvailable: true,
    permissionRequested: false,
    enabled: false,
    demoActive: false,
    ...opts,
  };
}

const granted = { read: true, write: true, history: true };

describe('connectionState', () => {
  test('ios, web and builds without the module hide every surface', () => {
    expect(connectionState(input({ availability: 'unsupported' })).state).toBe('hidden');
    expect(connectionState(input({ availability: 'unsupported', enabled: true, demoActive: true })).state).toBe('hidden');
  });

  test('status not read yet is loading, which renders nothing', () => {
    const view = connectionState(input({ availability: null }));
    expect(view.state).toBe('loading');
    expect(isConnectionVisible(view.state)).toBe(false);
  });

  test('sdk unavailable hides health connect unless sync was already on (2.7)', () => {
    expect(connectionState(input({ availability: 'unavailable' })).state).toBe('hidden');
    expect(connectionState(input({ availability: 'unavailable', enabled: true })).state).toBe('unavailable');
  });

  test('demo wins over every visible state (swift parity)', () => {
    expect(connectionState(input({ ...granted, enabled: true, demoActive: true })).state).toBe('demo');
    expect(connectionState(input({ availability: 'providerUpdateRequired', demoActive: true })).state).toBe('demo');
    // but a hidden integration stays hidden during demo
    expect(connectionState(input({ availability: 'unavailable', demoActive: true })).state).toBe('hidden');
  });

  test('provider update required', () => {
    expect(connectionState(input({ availability: 'providerUpdateRequired' })).state).toBe('updateRequired');
    expect(connectionState(input({ availability: 'providerUpdateRequired', enabled: true, ...granted })).state).toBe(
      'updateRequired'
    );
  });

  test('connected needs the switch and at least one direction', () => {
    expect(connectionState(input({ ...granted, enabled: true })).state).toBe('connected');
    expect(connectionState(input({ read: true, enabled: true })).state).toBe('connected');
    expect(connectionState(input({ write: true, enabled: true })).state).toBe('connected');
  });

  test('grants without the switch are ready to enable (swift readyToEnable)', () => {
    expect(connectionState(input({ ...granted })).state).toBe('readyToEnable');
    expect(connectionState(input({ write: true, permissionRequested: true })).state).toBe('readyToEnable');
  });

  test('no grants: never asked is notDetermined, asked is denied (2.8)', () => {
    expect(connectionState(input()).state).toBe('notDetermined');
    expect(connectionState(input({ permissionRequested: true })).state).toBe('denied');
    // revoked after connecting: the switch is still on, the request was made
    expect(connectionState(input({ permissionRequested: true, enabled: true })).state).toBe('denied');
  });

  test('partial grants set import-only or export-only only while connected', () => {
    const importOnly = connectionState(input({ read: true, enabled: true, history: true }));
    expect(importOnly).toMatchObject({ importOnly: true, exportOnly: false });
    const exportOnly = connectionState(input({ write: true, enabled: true }));
    expect(exportOnly).toMatchObject({ importOnly: false, exportOnly: true, historyMissing: false });
    expect(connectionState(input({ read: true })).importOnly).toBe(false);
  });

  test('history missing only when the feature exists and read is granted', () => {
    expect(connectionState(input({ read: true, write: true, enabled: true })).historyMissing).toBe(true);
    expect(
      connectionState(input({ read: true, write: true, enabled: true, historyFeatureAvailable: false })).historyMissing
    ).toBe(false);
    expect(connectionState(input({ ...granted, enabled: true })).historyMissing).toBe(false);
  });
});

describe('canPullFromHealthConnect (5.4)', () => {
  test('android, enabled, read granted, not demo', () => {
    expect(canPullFromHealthConnect(input({ ...granted, enabled: true }))).toBe(true);
    expect(canPullFromHealthConnect(input({ write: true, enabled: true }))).toBe(false);
    expect(canPullFromHealthConnect(input({ ...granted }))).toBe(false);
    expect(canPullFromHealthConnect(input({ ...granted, enabled: true, demoActive: true }))).toBe(false);
    expect(canPullFromHealthConnect(input({ ...granted, enabled: true, availability: 'unsupported' }))).toBe(false);
  });
});

describe('settings screen actions', () => {
  const v = (state: HcConnectionState, exportOnly = false) => ({ state, exportOnly });
  const idle = { isConnecting: false, isSyncing: false };

  test('primary action per state (swift handlePrimaryAction)', () => {
    expect(screenPrimaryAction(v('connected'))).toBe('pull');
    expect(screenPrimaryAction(v('readyToEnable'))).toBe('enable');
    expect(screenPrimaryAction(v('notDetermined'))).toBe('enable');
    expect(screenPrimaryAction(v('denied'))).toBe('openHealthConnect');
    expect(screenPrimaryAction(v('updateRequired'))).toBe('update');
    expect(screenPrimaryAction(v('unavailable'))).toBeNull();
    expect(screenPrimaryAction(v('demo'))).toBeNull();
  });

  test('write-only access syncs instead of pulling', () => {
    const view = connectionState(input({ write: true, enabled: true }));
    expect(screenPrimaryAction(view)).toBe('syncNow');
    expect(screenPrimaryTitle(view, idle)).toBe('Sync now');
    expect(screenPrimaryTitle(view, { isConnecting: false, isSyncing: true })).toBe('Syncing...');
  });

  test('primary titles follow the busy flags', () => {
    expect(screenPrimaryTitle(v('connected'), idle)).toBe('Pull from Health Connect');
    expect(screenPrimaryTitle(v('connected'), { isConnecting: false, isSyncing: true })).toBe(
      'Pulling Health Connect sleep...'
    );
    expect(screenPrimaryTitle(v('readyToEnable'), { isConnecting: true, isSyncing: false })).toBe('Turning on sync...');
    expect(screenPrimaryTitle(v('notDetermined'), idle)).toBe('Connect Health Connect');
    expect(screenPrimaryTitle(v('notDetermined'), { isConnecting: true, isSyncing: false })).toBe('Connecting...');
    expect(screenPrimaryTitle(v('denied'), idle)).toBe('Open Health Connect');
    expect(screenPrimaryTitle(v('demo'), idle)).toBeNull();
  });

  test('turn off is offered whenever the switch is on outside demo', () => {
    expect(showsDisableAction('connected', true)).toBe(true);
    expect(showsDisableAction('denied', true)).toBe(true);
    expect(showsDisableAction('unavailable', true)).toBe(true);
    expect(showsDisableAction('updateRequired', true)).toBe(true);
    expect(showsDisableAction('demo', true)).toBe(false);
    expect(showsDisableAction('readyToEnable', false)).toBe(false);
    expect(showsDisableAction('hidden', true)).toBe(false);
  });
});

describe('status tips', () => {
  test('connected tips include partial, read-window and adopted hints', () => {
    const view = connectionState(input({ read: true, enabled: true }));
    const ids = statusTips(view, { hasAdoptedImports: true }).map((t) => t.id);
    expect(ids).toEqual(['connected', 'importOnly', 'history', 'adopted']);
    expect(statusTips(view, { hasAdoptedImports: false }).find((t) => t.id === 'history')?.text).toBe(READ_WINDOW_HINT);
  });

  test('export only gets the mirror sentence and no read-window hint', () => {
    const view = connectionState(input({ write: true, enabled: true }));
    expect(statusTips(view, { hasAdoptedImports: false }).map((t) => t.text)).toEqual([
      TIP_COPY.connected,
      TIP_COPY.exportOnly,
    ]);
  });

  test('other states get their single swift tip', () => {
    for (const [state, id] of [
      ['readyToEnable', 'ready'],
      ['denied', 'denied'],
      ['demo', 'demo'],
      ['updateRequired', 'update'],
    ] as const) {
      const tips = statusTips({ state, importOnly: false, exportOnly: false, historyMissing: false }, { hasAdoptedImports: true });
      expect(tips.map((t) => t.id)).toEqual([id]);
    }
  });
});

describe('row copy', () => {
  test('denied shows the last error when there is one (swift parity)', () => {
    const view = connectionState(input({ permissionRequested: true }));
    expect(rowSummary(view, 'Twilight needs Health Connect permission to sync sleep sessions.')).toBe(
      'Twilight needs Health Connect permission to sync sleep sessions.'
    );
    expect(rowSummary(view, null)).toBe('Health Connect access is off for Twilight.');
  });

  test('the hero subtitle never promises a direction that is not granted', () => {
    expect(heroSubtitle(connectionState(input({ write: true, enabled: true })))).toBe(
      'Twilight saves your nights to Health Connect. Allow read access to import sleep from other apps.'
    );
    expect(heroSubtitle(connectionState(input({ read: true, enabled: true })))).toBe(
      'Twilight imports sleep from Health Connect. Allow write access to save your nights back.'
    );
    expect(heroSubtitle(connectionState(input({ read: true, write: true, enabled: true })))).toMatch(
      /^Twilight can import sleep from Health Connect and save/
    );
  });

  test('held deletion title pluralizes', () => {
    expect(heldDeletionTitle(1)).toBe('Health Connect removed 1 Twilight night');
    expect(heldDeletionTitle(3)).toBe('Health Connect removed 3 Twilight nights');
  });

  test('held deletion body matches the count', () => {
    expect(heldDeletionBody(1)).toMatch(/^This night was deleted .* unless you edit it\.$/);
    expect(heldDeletionBody(2)).toMatch(/^These nights were deleted .* unless you edit them\.$/);
    expect(heldRemovalPrompt(1)).toEqual({
      title: 'Remove this night from Twilight?',
      message: 'It is already gone from Health Connect. This deletes it from your Twilight journal too.',
    });
    expect(heldRemovalPrompt(4).title).toBe('Remove 4 nights from Twilight?');
    expect(heldRemovalPrompt(4).message).toMatch(/^They are already gone/);
  });
});

describe('onboarding step (5.2)', () => {
  test('state mapping and primary actions', () => {
    expect(onboardingState('connected')).toBe('connected');
    expect(onboardingState('hidden')).toBe('unavailable');
    expect(onboardingPrimaryAction('notDetermined')).toBe('enable');
    expect(onboardingPrimaryAction('readyToEnable')).toBe('enable');
    expect(onboardingPrimaryAction('denied')).toBe('openHealthConnect');
    expect(onboardingPrimaryAction('updateRequired')).toBe('update');
    expect(onboardingPrimaryAction('connected')).toBe('continue');
    expect(onboardingPrimaryAction('unavailable')).toBe('continue');
  });

  test('skip shows for ready, denied and update required (swift + update)', () => {
    const skip = (s: Parameters<typeof onboardingCopy>[0]) =>
      onboardingCopy(s, { isConnecting: false, lastErrorMessage: null }).showsSkip;
    expect(skip('readyToEnable')).toBe(true);
    expect(skip('denied')).toBe(true);
    expect(skip('updateRequired')).toBe(true);
    expect(skip('notDetermined')).toBe(false);
    expect(skip('connected')).toBe(false);
    expect(skip('unavailable')).toBe(false);
  });

  test('connecting copy', () => {
    const copy = onboardingCopy('connected', { isConnecting: true, lastErrorMessage: null });
    expect(copy.primary).toBe('Importing sleep...');
    expect(copy.subtitle).toBe('Importing your Health Connect sleep history into Twilight...');
    expect(onboardingCopy('notDetermined', { isConnecting: false, lastErrorMessage: null }).primary).toBe('Continue');
  });

  test('denied status note prefers the last error', () => {
    expect(onboardingCopy('denied', { isConnecting: false, lastErrorMessage: 'nope' }).statusNote).toBe('nope');
  });
});

describe('lastSyncedLabel', () => {
  const now = new Date(2026, 10, 8, 21, 0).getTime();
  const fmt = (ms: number) => String(new Date(ms).getHours());

  test('null, just now, today and older', () => {
    expect(lastSyncedLabel(null, now, fmt)).toBeNull();
    expect(lastSyncedLabel(now - 10_000, now, fmt)).toBe('Last synced just now');
    expect(lastSyncedLabel(now - 2 * 3600_000, now, fmt)).toBe('Last synced today at 19');
    expect(lastSyncedLabel(now - 30 * 3600_000, now, fmt)).toBe('Last synced 15');
  });
});
