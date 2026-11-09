// import merge rules and preview copy (docs/health-connect.md 6.4)
import { DEMO_SESSION_ID_PREFIX } from '../../../demo/demo-mode';
import type { ArchivedSession, DecodedArchive } from '../archive-format';
import { confirmationMessage, planImport, successMessage, type LocalArchiveState } from '../archive-merge';

const T0 = Date.UTC(2026, 10, 1, 22, 0);
const H = 3600_000;
const NOW = T0 + 100 * H;

function session(id: string, overrides: Partial<ArchivedSession> = {}): ArchivedSession {
  return {
    id,
    tag: 'Manual Log',
    startTime: T0,
    endTime: T0 + 8 * H,
    startTimeZone: 'Europe/Paris',
    endTimeZone: 'Europe/Paris',
    createdAt: T0 + 9 * H,
    updatedAt: T0 + 9 * H,
    needsHealthSync: false,
    healthSyncVersion: T0 + 9 * H,
    imported: false,
    adopted: false,
    provider: null,
    nightKey: null,
    sourceId: null,
    ...overrides,
  };
}

function archive(sessions: ArchivedSession[], overrides: Partial<DecodedArchive> = {}): DecodedArchive {
  return {
    source: 'port',
    exportedAt: T0 + 10 * H,
    appVersion: '1.0.0',
    settings: { isOnboarded: true, optimalSleepMinutes: 1320, optimalWakeMinutes: 420, windDownReminderEnabled: true },
    appearance: { themeMode: 'dark', colorPalette: 'twilight' },
    sessions,
    tombstones: [],
    ...overrides,
  };
}

function local(sessions: ArchivedSession[], overrides: Partial<LocalArchiveState> = {}): LocalArchiveState {
  return {
    sessions,
    settings: { isOnboarded: true, optimalSleepMinutes: 1320, optimalWakeMinutes: 420, windDownReminderEnabled: true },
    appearance: { themeMode: 'dark', colorPalette: 'twilight' },
    ...overrides,
  };
}

describe('planImport', () => {
  test('counts new and updated sessions; sync bookkeeping alone is not an update', () => {
    const plan = planImport(
      archive([session('same'), session('synced', { needsHealthSync: true, healthSyncVersion: 1 }), session('edited', { endTime: T0 + 9 * H }), session('new')]),
      local([session('same'), session('synced'), session('edited'), session('local-only')]),
      NOW
    );
    expect(plan.preview).toMatchObject({ sessionCount: 4, newSessions: 1, updatedSessions: 1, settingsChanges: 0, appearanceChanges: 0 });
    expect(plan.inserts.map((s) => s.id)).toEqual(['new']);
    expect(plan.updates.map((s) => s.id)).toEqual(['edited']);
  });

  test('restored owned nights are pending with a clock version above the file and the local one', () => {
    const fileVersion = NOW + 5 * H;
    const plan = planImport(
      archive([session('new', { healthSyncVersion: fileVersion }), session('edited', { endTime: T0 + 9 * H, healthSyncVersion: 7 })]),
      local([session('edited', { healthSyncVersion: NOW + 9 * H })]),
      NOW
    );
    expect(plan.inserts[0]).toMatchObject({ needsHealthSync: true, healthSyncVersion: fileVersion + 1 });
    expect(plan.updates[0]).toMatchObject({ needsHealthSync: true, healthSyncVersion: NOW + 9 * H + 1 });
    const fresh = planImport(archive([session('old', { healthSyncVersion: 3 })]), local([]), NOW);
    expect(fresh.inserts[0].healthSyncVersion).toBe(NOW);
  });

  test('imports and adopted nights are never pending', () => {
    const imported = session('imp', { imported: true, provider: 'health_connect', nightKey: 'k', needsHealthSync: true });
    const adopted = session('adp', { adopted: true, provider: 'health_connect', nightKey: 'k2', needsHealthSync: true });
    const healthkit = session('hk', { imported: true, provider: 'healthkit', nightKey: '2024-08-10' });
    const plan = planImport(archive([imported, adopted, healthkit]), local([]), NOW);
    expect(plan.inserts.map((s) => [s.id, s.needsHealthSync])).toEqual([
      ['imp', false],
      ['adp', false],
      ['hk', false],
    ]);
  });

  test('an active session on the device stays; the incoming active session is skipped', () => {
    const incomingActive = session('incoming', { endTime: null, endTimeZone: null });
    const plan = planImport(archive([incomingActive, session('ended')]), local([session('mine', { endTime: null, endTimeZone: null })]), NOW);
    expect(plan.skippedActiveId).toBe('incoming');
    expect(plan.preview.hasActiveSessionConflict).toBe(true);
    expect(plan.inserts.map((s) => s.id)).toEqual(['ended']);
    // without a local active session the incoming one is restored
    const noConflict = planImport(archive([incomingActive]), local([]), NOW);
    expect(noConflict.inserts.map((s) => s.id)).toEqual(['incoming']);
    expect(noConflict.preview.hasActiveSessionConflict).toBe(false);
  });

  test('demo sessions in a file are dropped', () => {
    const plan = planImport(
      archive([session(`${DEMO_SESSION_ID_PREFIX}1`), session('demo-tag', { tag: 'Demo Log' }), session('real')]),
      local([]),
      NOW
    );
    expect(plan.inserts.map((s) => s.id)).toEqual(['real']);
    expect(plan.preview.sessionCount).toBe(1);
  });

  test('settings and appearance changes; healthSyncEnabled is not part of the import', () => {
    const plan = planImport(
      archive([], {
        settings: { isOnboarded: true, optimalSleepMinutes: 1380, optimalWakeMinutes: 450, windDownReminderEnabled: true },
        appearance: { themeMode: 'light', colorPalette: null },
      }),
      local([], { appearance: { themeMode: 'dark', colorPalette: 'amethyst' } }),
      NOW
    );
    expect(plan.preview).toMatchObject({ settingsChanges: 2, appearanceChanges: 1 });
  });

  test('tombstones pass through for the repository union', () => {
    const tombstones = [{ nightKey: 'k', deletedAt: T0, recordIds: ['r1'] }];
    expect(planImport(archive([], { tombstones }), local([]), NOW).tombstones).toEqual(tombstones);
  });
});

describe('import copy', () => {
  const format = (ms: number) => new Date(ms).toISOString();

  test('confirmation lists every line in swift order', () => {
    const plan = planImport(
      archive([session('new'), session('active', { endTime: null, endTimeZone: null })], {
        settings: { isOnboarded: true, optimalSleepMinutes: 1380, optimalWakeMinutes: 420, windDownReminderEnabled: true },
        appearance: { themeMode: 'light', colorPalette: 'twilight' },
      }),
      local([session('mine', { endTime: null, endTimeZone: null })]),
      NOW
    );
    expect(confirmationMessage(plan.preview, format)).toBe(
      [
        'Are you sure you want to import this data?',
        '',
        'Exported: 2026-11-02T08:00:00.000Z.',
        'Backup app version: 1.0.0.',
        'This import merges with your current data and does not delete local records.',
        'Sessions: 2 total, 1 new, 0 updated.',
        'Sleep settings changes: 1.',
        'Appearance changes: 1.',
        "Your device already has an active session; it stays active and the backup's active session is skipped.",
        'A full backup of your current data will be created automatically before import.',
      ].join('\n')
    );
  });

  test('a swift backup says what is imported; no version line without a version', () => {
    const plan = planImport(archive([], { source: 'swift', appVersion: null }), local([]), NOW);
    const message = confirmationMessage(plan.preview, format);
    expect(message).toContain('This backup is from Twilight for iPhone. Only sleep sessions and sleep settings are imported.');
    expect(message).not.toContain('Backup app version');
  });

  test('success message', () => {
    const plan = planImport(archive([session('a'), session('b')]), local([session('a', { endTime: T0 + 9 * H })]), NOW);
    expect(successMessage(plan.preview, 'twilight_pre_import_backup_20261108_120000.json')).toBe(
      'Sessions imported: 1 new, 1 updated.\nSafety backup saved as twilight_pre_import_backup_20261108_120000.json.'
    );
  });
});
