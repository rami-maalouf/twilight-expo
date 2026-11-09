// app wiring for backup export/import and session export (docs/health-connect.md
// 6.5): files under expo-file-system, the system share sheet via expo-sharing,
// the document picker via expo-document-picker. both platforms.
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

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

// swift TemporaryExportFileManager + ShareSheetPresenter
async function shareText(name: string, contents: string, mimeType: string, uti: string, title: string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.writeSync(contents);
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: title });
}

export async function exportFullBackup(): Promise<void> {
  await shareText(
    archiveManager.backupFilename(),
    archiveManager.exportArchiveJson(),
    'application/json',
    'public.json',
    'Export Full Backup'
  );
}

export async function exportSessions(options: {
  format: ExportFormat;
  sortDirection: ExportSortDirection;
  timeZone: ExportTimeZone;
}): Promise<void> {
  const nowMs = Date.now();
  const sessions = archiveRepo.listSessions();
  const exportOptions = { ...options, deviceZone: deviceTimeZone(), nowMs };
  const base = `twilight_sessions_${Math.floor(nowMs / 1000)}`;
  if (options.format === 'csv') {
    await shareText(`${base}.csv`, exportSessionsCsv(sessions, exportOptions), 'text/csv', 'public.comma-separated-values-text', 'Export Sessions');
  } else {
    await shareText(`${base}.md`, exportSessionsMarkdown(sessions, exportOptions), 'text/markdown', 'net.daringfireball.markdown', 'Export Sessions');
  }
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
