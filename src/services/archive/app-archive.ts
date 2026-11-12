// app wiring for backup export/import and session export (docs/health-connect.md
// 6.5): files under expo-file-system, the system share sheet via expo-sharing,
// the document picker via expo-document-picker. both platforms.
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import DocumentSave from '../../../modules/twilight-document-save';
import { archiveRepo, settingsStore } from '../../data/app-db';
import { ArchiveError } from '../../domain/archive/archive-format';
import {
  exportSessionsCsv,
  exportSessionsMarkdown,
  type ExportFormat,
  type ExportSortDirection,
  type ExportTimeZone,
} from '../../domain/archive/session-export';
import { appSleepStore } from '../../state/app-sleep-store';
import { useSettings } from '../../state/settings-state';
import { healthSyncEngine } from '../health-connect/app-health-sync';
import { ArchiveManager, type BackupFolder, type ImportResult, type PreparedImport } from './archive-manager';

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

function backupDirectory(): Directory {
  const dir = new Directory(Paths.document, 'DataBackups');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

const backupFolder: BackupFolder = {
  write: (name, contents) => {
    const file = new File(backupDirectory(), name);
    file.create({ overwrite: true });
    file.writeSync(contents);
  },
  list: () => backupDirectory().list().filter((entry) => entry instanceof File).map((file) => file.name),
  remove: (name) => {
    const file = new File(backupDirectory(), name);
    if (file.exists) file.delete();
  },
};

export const archiveManager = new ArchiveManager({
  repo: archiveRepo,
  settings: settingsStore,
  backups: backupFolder,
  runExclusive: (fn) => healthSyncEngine.runExclusive(fn),
  timeZone: deviceTimeZone,
  appVersion: Constants.expoConfig?.version ?? null,
  platform: Platform.OS,
});

// where an export goes: the system share sheet (swift ShareSheetPresenter), or
// on android a file the user saves through the create-document picker,
// because the android share sheet has no local save target (13)
export type ExportDestination = 'share' | 'device';

export type ExportOutcome = { kind: 'shared' } | { kind: 'saved'; displayName: string } | { kind: 'cancelled' };

export const canSaveToDevice = Platform.OS === 'android' && DocumentSave != null;

interface ExportFile {
  name: string;
  contents: string;
  mimeType: string;
  uti: string;
  title: string;
}

// swift TemporaryExportFileManager + ShareSheetPresenter
async function deliver(destination: ExportDestination, file: ExportFile): Promise<ExportOutcome> {
  if (destination === 'device') {
    if (!DocumentSave) throw new Error('Saving files is not available on this device.');
    const saved = await DocumentSave.saveTextDocument(file.name, file.mimeType, file.contents);
    return saved ? { kind: 'saved', displayName: saved.displayName } : { kind: 'cancelled' };
  }
  const cached = new File(Paths.cache, file.name);
  cached.create({ overwrite: true });
  cached.writeSync(file.contents);
  await Sharing.shareAsync(cached.uri, { mimeType: file.mimeType, UTI: file.uti, dialogTitle: file.title });
  return { kind: 'shared' };
}

export function exportFullBackup(destination: ExportDestination = 'share'): Promise<ExportOutcome> {
  return deliver(destination, {
    name: archiveManager.backupFilename(),
    contents: archiveManager.exportArchiveJson(),
    mimeType: 'application/json',
    uti: 'public.json',
    title: 'Export Full Backup',
  });
}

export function exportSessions(options: {
  format: ExportFormat;
  sortDirection: ExportSortDirection;
  timeZone: ExportTimeZone;
  destination?: ExportDestination;
}): Promise<ExportOutcome> {
  const { destination = 'share', ...rest } = options;
  const nowMs = Date.now();
  const sessions = archiveRepo.listSessions();
  const exportOptions = { ...rest, deviceZone: deviceTimeZone(), nowMs };
  const base = `twilight_sessions_${Math.floor(nowMs / 1000)}`;
  return deliver(
    destination,
    rest.format === 'csv'
      ? {
          name: `${base}.csv`,
          contents: exportSessionsCsv(sessions, exportOptions),
          mimeType: 'text/csv',
          uti: 'public.comma-separated-values-text',
          title: 'Export Sessions',
        }
      : {
          name: `${base}.md`,
          contents: exportSessionsMarkdown(sessions, exportOptions),
          mimeType: 'text/markdown',
          uti: 'net.daringfireball.markdown',
          title: 'Export Sessions',
        }
  );
}

// null when the user cancels the picker
export async function pickBackup(): Promise<PreparedImport | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // some android providers label .json files as text or binary
    type: Platform.OS === 'android' ? ['application/json', 'text/plain', 'application/octet-stream'] : 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  let text: string;
  try {
    text = await new File(result.assets[0].uri).text();
  } catch {
    throw ArchiveError.unreadableFile();
  }
  return archiveManager.prepareImport(text);
}

export async function importBackup(prepared: PreparedImport): Promise<ImportResult> {
  const result = await archiveManager.runImport(prepared.archive);
  appSleepStore.getState().refresh();
  useSettings.getState().refresh();
  return result;
}
