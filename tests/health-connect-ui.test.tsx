// platform guards for every health connect surface (docs/health-connect.md 2.7,
// 5.2-5.4, 7.3 "ios"): ios renders none of them; android renders them from
// the engine snapshot. the native module is never loaded in jest.
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsStore, type KeyValueStorage } from '@/data/settings-store';
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

const mockPlatform = { supported: false };
jest.mock('@/services/health-connect/native-adapter', () => {
  const actual = jest.requireActual('@/services/health-connect/native-adapter');
  // a lazy getter (defineProperty, so neither the spread nor babel interop
  // evaluates it at import) lets each test pick the platform
  const mocked = { __esModule: true, ...actual };
  Object.defineProperty(mocked, 'isHealthConnectSupported', { get: () => mockPlatform.supported });
  return mocked;
});

import HealthConnectScreen from '@/app/health-connect';
import { HealthConnectSection } from '@/components/settings/HealthConnectSection';
import { WeekEmptyState } from '@/components/dashboard/WeekEmptyState';
import type { HcStatus } from '@/services/health-connect/adapter';
import { showsHealthConnectOnboarding } from '@/services/health-connect/app-health-sync';
import { healthSyncStore } from '@/services/health-connect/health-connect-state';

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return { getItemSync: (k) => map.get(k) ?? null, setItemSync: (k, v) => void map.set(k, v) };
}

const ANDROID_STATUS: HcStatus = {
  availability: 'available',
  read: true,
  write: true,
  history: true,
  historyFeatureAvailable: true,
  packageName: 'com.rami.twilight.port',
  sdkInt: 36,
};

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

function renderThemed(element: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider store={new SettingsStore(memoryKv())}>{element}</ThemeProvider>
    </SafeAreaProvider>
  );
}

// the screen's clock ticks once on a zero timeout; flush it inside act
async function renderScreen() {
  const result = await renderThemed(<HealthConnectScreen />);
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return result;
}

function setSnapshot(status: HcStatus | null, enabled: boolean) {
  healthSyncStore.setState({ status, enabled, permissionRequested: enabled });
}

afterEach(async () => {
  await cleanup();
  mockPlatform.supported = false;
  setSnapshot(null, false);
});

describe('ios (health connect unsupported)', () => {
  test('settings section renders nothing, even with a stale snapshot', async () => {
    setSnapshot(ANDROID_STATUS, true);
    const { queryByTestId, queryByText } = await renderThemed(<HealthConnectSection />);
    expect(queryByTestId('health-connect-row')).toBeNull();
    expect(queryByText('HEALTH CONNECT')).toBeNull();
  });

  test('dashboard empty state keeps the original copy and has no pull', async () => {
    setSnapshot(ANDROID_STATUS, true);
    const { getByText, queryByTestId } = await renderThemed(<WeekEmptyState />);
    getByText('Your sleep story starts tonight');
    expect(queryByTestId('week-empty-pull')).toBeNull();
  });

  test('onboarding skips the health connect step', async () => {
    await expect(showsHealthConnectOnboarding()).resolves.toBe(false);
  });

  test('the health connect route redirects home', async () => {
    setSnapshot(ANDROID_STATUS, true);
    const { getByTestId, queryByTestId } = await renderScreen();
    expect(getByTestId('redirect').props.children).toBe('/');
    expect(queryByTestId('health-connect-scroll')).toBeNull();
  });
});

describe('android', () => {
  beforeEach(() => {
    mockPlatform.supported = true;
  });

  test('settings row shows the connection label and summary', async () => {
    setSnapshot(ANDROID_STATUS, true);
    const { getByTestId, getByText } = await renderThemed(<HealthConnectSection />);
    expect(getByTestId('health-connect-row-status').props.children).toBe('Connected');
    getByText(
      'Twilight can import sleep from Health Connect and save the nights you log in Twilight back to Health Connect.'
    );
  });

  test('settings row is hidden while the status is unknown and when the sdk is unavailable', async () => {
    setSnapshot(null, false);
    const first = await renderThemed(<HealthConnectSection />);
    expect(first.queryByTestId('health-connect-row')).toBeNull();
    await first.unmount();
    setSnapshot({ ...ANDROID_STATUS, availability: 'unavailable', read: false, write: false }, false);
    const second = await renderThemed(<HealthConnectSection />);
    expect(second.queryByTestId('health-connect-row')).toBeNull();
  });

  test('sdk unavailable after connecting keeps the row so sync can be turned off', async () => {
    setSnapshot({ ...ANDROID_STATUS, availability: 'unavailable', read: false, write: false }, true);
    const { getByTestId } = await renderThemed(<HealthConnectSection />);
    expect(getByTestId('health-connect-row-status').props.children).toBe('Unavailable');
  });

  test('dashboard empty state offers the pull when connected with read', async () => {
    setSnapshot(ANDROID_STATUS, true);
    const { getByText, getByTestId } = await renderThemed(<WeekEmptyState />);
    getByText('No Health Connect sleep yet');
    getByTestId('week-empty-pull');
  });

  test('dashboard empty state has no pull with write-only access', async () => {
    setSnapshot({ ...ANDROID_STATUS, read: false, history: false }, true);
    const { queryByTestId } = await renderThemed(<WeekEmptyState />);
    expect(queryByTestId('week-empty-pull')).toBeNull();
  });

  test('onboarding shows the step when health connect is visible', async () => {
    setSnapshot({ ...ANDROID_STATUS, read: false, write: false, history: false }, false);
    await expect(showsHealthConnectOnboarding()).resolves.toBe(true);
    setSnapshot({ ...ANDROID_STATUS, availability: 'unavailable', read: false, write: false }, false);
    await expect(showsHealthConnectOnboarding()).resolves.toBe(false);
  });

  test('the screen shows one held night with singular copy and both actions', async () => {
    setSnapshot(ANDROID_STATUS, true);
    healthSyncStore.setState({ heldRemoteDeletions: ['s1'] });
    const { getByTestId, getByText } = await renderScreen();
    getByTestId('health-connect-state-connected');
    getByText('Health Connect removed 1 Twilight night');
    getByText('This night was deleted in Health Connect. Twilight still has it and will not send it back unless you edit it.');
    getByTestId('health-connect-keep-held');
    getByTestId('health-connect-remove-held');
    await act(() => healthSyncStore.setState({ heldRemoteDeletions: [] }));
  });

  test('write-only access offers sync now instead of pull', async () => {
    setSnapshot({ ...ANDROID_STATUS, read: false, history: false }, true);
    const { getByTestId } = await renderScreen();
    expect(getByTestId('health-connect-primary').props.accessibilityLabel).toBe('Sync now');
  });

  test('back falls back to settings when the screen is the root', async () => {
    setSnapshot(ANDROID_STATUS, true);
    const mockRouter = jest.requireMock('expo-router').router;
    const { getByTestId } = await renderScreen();
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await fireEvent.press(getByTestId('health-connect-back'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/settings');
    await fireEvent.press(getByTestId('health-connect-back'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });
});
