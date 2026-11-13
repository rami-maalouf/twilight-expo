// export delivery (docs/health-connect.md 13): the share sheet everywhere,
// and on android a file saved through the create-document picker. the native
// module, file system and share sheet are mocked; the archive content has its
// own tests.
const mockSaveTextDocument = jest.fn();
const mockShareAsync = jest.fn(async () => {});
const mockWrites: { name: string; contents: string }[] = [];
let mockModulePresent = true;

jest.mock('../../../../modules/twilight-document-save', () => ({
  __esModule: true,
  get default() {
    return mockModulePresent ? { saveTextDocument: mockSaveTextDocument } : null;
  },
}));

jest.mock('expo-file-system', () => ({
  Paths: { cache: '/cache', document: '/documents' },
  Directory: class {},
  File: class {
    uri: string;
    name: string;
    constructor(_dir: string, fileName: string) {
      this.name = fileName;
      this.uri = `file:///cache/${fileName}`;
    }
    create() {}
    writeSync(contents: string) {
      mockWrites.push({ name: this.name, contents });
    }
  },
}));
jest.mock('expo-sharing', () => ({ shareAsync: mockShareAsync }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../../../data/app-db', () => {
  const { memoryDb } = jest.requireActual('../../../../tests/helpers/memory-db');
  const { migrate } = jest.requireActual('../../../data/db');
  const { ArchiveRepo } = jest.requireActual('../../../data/archive-repo');
  const { SettingsStore } = jest.requireActual('../../../data/settings-store');
  const db = memoryDb();
  migrate(db);
  const map = new Map<string, string>();
  return {
    archiveRepo: new ArchiveRepo(db),
    settingsStore: new SettingsStore({
      getItemSync: (k: string) => map.get(k) ?? null,
      setItemSync: (k: string, v: string) => void map.set(k, v),
    }),
  };
});
jest.mock('../../../state/app-sleep-store', () => ({ appSleepStore: { getState: () => ({ refresh: jest.fn() }) } }));
jest.mock('../../../state/settings-state', () => ({ useSettings: { getState: () => ({ refresh: jest.fn() }) } }));
jest.mock('../../health-connect/app-health-sync', () => ({
  healthSyncEngine: { runExclusive: (fn: () => unknown) => Promise.resolve(fn()) },
}));

type AppArchive = typeof import('../app-archive');

// isolateModules gives a fresh registry, so the platform is set on that
// registry's react-native before app-archive reads it at load time
function loadOn(os: 'ios' | 'android'): AppArchive {
  let loaded!: AppArchive;
  jest.isolateModules(() => {
    const { Platform } = jest.requireActual('react-native');
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    loaded = jest.requireActual('../app-archive');
  });
  return loaded;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWrites.length = 0;
  mockModulePresent = true;
});

describe('save to device availability', () => {
  test('android with the native module', () => {
    expect(loadOn('android').canSaveToDevice).toBe(true);
  });

  test('never on ios (the share sheet has "Save to Files")', () => {
    expect(loadOn('ios').canSaveToDevice).toBe(false);
  });

  test('not on android builds without the native module', () => {
    mockModulePresent = false;
    expect(loadOn('android').canSaveToDevice).toBe(false);
  });
});

describe('exportFullBackup', () => {
  test('device: hands the backup json to the create-document picker and returns the saved name', async () => {
    const archive = loadOn('android');
    mockSaveTextDocument.mockResolvedValue({ uri: 'content://x/1', displayName: 'twilight_backup (1).json' });
    await expect(archive.exportFullBackup('device')).resolves.toEqual({
      kind: 'saved',
      displayName: 'twilight_backup (1).json',
    });
    const [name, mimeType, contents] = mockSaveTextDocument.mock.calls[0];
    expect(name).toMatch(/^twilight_backup_\d{8}_\d{6}\.json$/);
    expect(mimeType).toBe('application/json');
    expect(JSON.parse(contents).metadata.archiveType).toBe('twilight-expo-backup');
    expect(mockShareAsync).not.toHaveBeenCalled();
    expect(mockWrites).toEqual([]);
  });

  test('device: a backed-out picker is a cancel, not an error', async () => {
    mockSaveTextDocument.mockResolvedValue(null);
    await expect(loadOn('android').exportFullBackup('device')).resolves.toEqual({ kind: 'cancelled' });
  });

  test('device: a native failure reaches the caller', async () => {
    mockSaveTextDocument.mockRejectedValue(new Error('The document could not be opened for writing'));
    await expect(loadOn('android').exportFullBackup('device')).rejects.toThrow(
      'The document could not be opened for writing'
    );
  });

  test('device without the module throws instead of silently sharing', async () => {
    mockModulePresent = false;
    await expect(loadOn('android').exportFullBackup('device')).rejects.toThrow(
      'Saving files is not available on this device.'
    );
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  test('share (default): writes a cache file and opens the share sheet', async () => {
    await expect(loadOn('ios').exportFullBackup()).resolves.toEqual({ kind: 'shared' });
    expect(mockWrites).toHaveLength(1);
    expect(mockShareAsync).toHaveBeenCalledWith(`file:///cache/${mockWrites[0].name}`, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Export Full Backup',
    });
    expect(mockSaveTextDocument).not.toHaveBeenCalled();
  });
});

describe('exportSessions', () => {
  const options = { sortDirection: 'ascending', timeZone: 'utc' } as const;

  test('device: csv and markdown file names and mime types', async () => {
    const archive = loadOn('android');
    mockSaveTextDocument.mockResolvedValue({ uri: 'content://x/2', displayName: 'a.csv' });
    await archive.exportSessions({ ...options, format: 'csv', destination: 'device' });
    await archive.exportSessions({ ...options, format: 'markdown', destination: 'device' });
    const [[csvName, csvMime, csv], [mdName, mdMime]] = mockSaveTextDocument.mock.calls;
    expect(csvName).toMatch(/^twilight_sessions_\d+\.csv$/);
    expect(csvMime).toBe('text/csv');
    expect(csv.split('\n')[0]).toBe('session_id,profile_name,start_time,end_time,break_start_time,break_end_time');
    expect(mdName).toMatch(/^twilight_sessions_\d+\.md$/);
    expect(mdMime).toBe('text/markdown');
  });

  test('share is the default destination', async () => {
    await expect(loadOn('android').exportSessions({ ...options, format: 'csv' })).resolves.toEqual({ kind: 'shared' });
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
    expect(mockSaveTextDocument).not.toHaveBeenCalled();
  });
});
