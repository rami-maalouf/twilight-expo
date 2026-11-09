// settings data section and data management screen (docs/health-connect.md 6.6):
// demo isolation, the import preview / confirm / success alerts and error copy.
// file io and the share sheet are mocked; the archive logic has its own tests.
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsStore, type KeyValueStorage } from '@/data/settings-store';
import { ArchiveError } from '@/domain/archive/archive-format';
import { ThemeProvider } from '@/theme/ThemeProvider';

jest.mock('@/data/app-db', () => {
  const { memoryDb } = require('./helpers/memory-db');
  const { migrate } = require('@/data/db');
  const { SessionRepo } = require('@/data/session-repo');
  const { SettingsStore } = require('@/data/settings-store');
  const { DemoDataManager } = require('@/demo/demo-data-manager');
  const db = memoryDb();
  migrate(db);
  const map = new Map<string, string>();
  const kv = {
    getItemSync: (key: string) => map.get(key) ?? null,
    setItemSync: (key: string, value: string) => void map.set(key, value),
  };
  const sessionRepo = new SessionRepo(db);
  const settingsStore = new SettingsStore(kv);
  return { sessionRepo, settingsStore, demoDataManager: new DemoDataManager(sessionRepo, settingsStore) };
});

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  return {
    ...jest.requireActual('expo-router'),
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  };
});

jest.mock('@/services/archive/app-archive', () => ({
  exportFullBackup: jest.fn(async () => {}),
  exportSessions: jest.fn(async () => {}),
  pickBackup: jest.fn(),
  importBackup: jest.fn(),
}));

import DataManagementScreen from '@/app/data-management';
import { DataSection } from '@/components/settings/DataSection';
import * as archive from '@/services/archive/app-archive';
import { useSettings } from '@/state/settings-state';
import { router } from 'expo-router';

const mocked = archive as jest.Mocked<typeof archive>;

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return { getItemSync: (k) => map.get(k) ?? null, setItemSync: (k, v) => void map.set(k, v) };
}

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderThemed(element: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider store={new SettingsStore(memoryKv())}>{element}</ThemeProvider>
    </SafeAreaProvider>
  );
}

const preview = {
  source: 'port' as const,
  exportedAt: Date.UTC(2026, 10, 8, 7, 12),
  appVersion: '1.0.0',
  sessionCount: 3,
  newSessions: 2,
  updatedSessions: 1,
  settingsChanges: 0,
  appearanceChanges: 0,
  hasActiveSessionConflict: false,
};

let alertSpy: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await act(async () => useSettings.getState().setSetting('isDemoDataActive', false));
});

afterEach(async () => {
  await cleanup();
  alertSpy.mockRestore();
});

const flush = () => act(async () => {});

describe('settings data section', () => {
  test('opens data management', async () => {
    const { getByTestId } = await renderThemed(<DataSection />);
    await fireEvent.press(getByTestId('data-management-row'));
    expect(router.push).toHaveBeenCalledWith('/data-management');
  });

  test('hidden while demo data is active (swift parity)', async () => {
    await act(async () => useSettings.getState().setSetting('isDemoDataActive', true));
    expect((await renderThemed(<DataSection />)).queryByTestId('data-management-row')).toBeNull();
  });
});

describe('data management screen', () => {
  test('redirects to settings while demo data is active', async () => {
    await act(async () => useSettings.getState().setSetting('isDemoDataActive', true));
    expect((await renderThemed(<DataManagementScreen />)).getByTestId('redirect').props.children).toBe('/settings');
  });

  test('import: preview alert, confirm, then the success alert', async () => {
    mocked.pickBackup.mockResolvedValue({ archive: {} as never, preview });
    mocked.importBackup.mockResolvedValue({ preview, backupName: 'twilight_pre_import_backup_20261108_071500.json' });
    const { getByTestId } = await renderThemed(<DataManagementScreen />);
    await fireEvent.press(getByTestId('import-backup'));
    await flush();
    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, AlertButton[]];
    expect(title).toBe('Import Backup');
    expect(message).toContain('Sessions: 3 total, 2 new, 1 updated.');
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Import']);
    await act(async () => {
      await buttons[1].onPress?.();
    });
    expect(mocked.importBackup).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Import Complete',
      'Sessions imported: 2 new, 1 updated.\nSafety backup saved as twilight_pre_import_backup_20261108_071500.json.'
    );
  });

  test('a cancelled picker shows nothing', async () => {
    mocked.pickBackup.mockResolvedValue(null);
    const { getByTestId } = await renderThemed(<DataManagementScreen />);
    await fireEvent.press(getByTestId('import-backup'));
    await flush();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  test('an invalid file shows the archive error copy', async () => {
    mocked.pickBackup.mockRejectedValue(ArchiveError.unsupportedSchema(9));
    const { getByTestId } = await renderThemed(<DataManagementScreen />);
    await fireEvent.press(getByTestId('import-backup'));
    await flush();
    expect(alertSpy).toHaveBeenCalledWith('Data Error', 'This backup uses schema version 9, which this app version cannot import.');
  });

  test('exports: full backup and sessions with the chosen options', async () => {
    const { getByTestId, getByText } = await renderThemed(<DataManagementScreen />);
    await fireEvent.press(getByTestId('export-full-backup'));
    await flush();
    expect(mocked.exportFullBackup).toHaveBeenCalledTimes(1);
    expect(getByText('Export Sessions as CSV')).toBeTruthy();
    await fireEvent.press(getByTestId('export-sessions'));
    await flush();
    expect(mocked.exportSessions).toHaveBeenCalledWith({ format: 'csv', sortDirection: 'ascending', timeZone: 'utc' });
    mocked.exportSessions.mockRejectedValueOnce(new Error('disk full'));
    await fireEvent.press(getByTestId('export-sessions'));
    await flush();
    expect(alertSpy).toHaveBeenCalledWith('Data Error', 'disk full');
  });
});
