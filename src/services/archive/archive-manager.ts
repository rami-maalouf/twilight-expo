// ports: DataArchiveManager.swift exportArchiveJSON / previewImport /
// importArchive / createAutomaticBackup (docs/health-connect.md 6.4).
// no expo imports: file io is injected, so jest drives the whole flow.
import {
  buildArchivePayload,
  decodeArchive,
  encodeArchive,
  type DecodedArchive,
} from '../../domain/archive/archive-format';
import { planImport, type ImportPlan, type ImportPreview, type LocalArchiveState } from '../../domain/archive/archive-merge';
import type { ArchiveRepo } from '../../data/archive-repo';
import type { SettingsStore } from '../../data/settings-store';

export const PRE_IMPORT_BACKUP_PREFIX = 'twilight_pre_import_backup_';
// swift keeps every pre-import backup; the port keeps the newest 10 (6.4)
export const MAX_PRE_IMPORT_BACKUPS = 10;

// the automatic backup folder (<documents>/DataBackups)
export interface BackupFolder {
  write(name: string, contents: string): void;
  list(): string[];
  remove(name: string): void;
}

export interface ArchiveManagerDeps {
  repo: ArchiveRepo;
  settings: SettingsStore;
  backups: BackupFolder;
  // health sync engine runExclusive: waits for the current run, blocks new
  // ones while the import writes, then requests a full sync (4.3)
  runExclusive: <T>(fn: () => T | Promise<T>) => Promise<T>;
  timeZone: () => string;
  appVersion: string | null;
  platform: string;
  now?: () => number;
}

export interface PreparedImport {
  archive: DecodedArchive;
  preview: ImportPreview;
}

export interface ImportResult {
  preview: ImportPreview;
  backupName: string;
}

// yyyyMMdd_HHmmss in utc (swift automaticBackupFilename / defaultBackupFilename)
export function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
}

export class ArchiveManager {
  constructor(private readonly deps: ArchiveManagerDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private localState(): LocalArchiveState {
    const s = this.deps.settings;
    return {
      sessions: this.deps.repo.listSessions(),
      settings: {
        isOnboarded: s.get('isOnboarded'),
        optimalSleepMinutes: s.get('optimalSleepMinutes'),
        optimalWakeMinutes: s.get('optimalWakeMinutes'),
        windDownReminderEnabled: s.get('windDownReminderEnabled'),
      },
      appearance: { themeMode: s.get('themeMode'), colorPalette: s.get('themePalette') },
    };
  }

  exportArchiveJson(): string {
    const local = this.localState();
    return encodeArchive(
      buildArchivePayload({
        sessions: local.sessions,
        tombstones: this.deps.repo.listTombstones(),
        settings: { ...local.settings, healthSyncEnabled: this.deps.settings.get('healthSyncEnabled') },
        appearance: local.appearance,
        nowMs: this.now(),
        timeZoneIdentifier: this.deps.timeZone(),
        appVersion: this.deps.appVersion,
        platform: this.deps.platform,
      })
    );
  }

  backupFilename(): string {
    return `twilight_backup_${utcStamp(this.now())}.json`;
  }

  // decode, validate and preview; throws ArchiveError with the user copy
  prepareImport(text: string): PreparedImport {
    const archive = decodeArchive(text);
    return { archive, preview: planImport(archive, this.localState(), this.now()).preview };
  }

  // re-plans against the data as it is when the import runs (a sync may have
  // changed it since the preview), saves the safety backup, then writes
  async runImport(archive: DecodedArchive): Promise<ImportResult> {
    return this.deps.runExclusive(() => {
      const plan: ImportPlan = planImport(archive, this.localState(), this.now());
      const backupName = this.writePreImportBackup();
      this.deps.repo.applyImport(plan);
      this.applySettings(archive);
      return { preview: plan.preview, backupName };
    });
  }

  private writePreImportBackup(): string {
    const { backups } = this.deps;
    const name = `${PRE_IMPORT_BACKUP_PREFIX}${utcStamp(this.now())}.json`;
    backups.write(name, this.exportArchiveJson());
    const kept = backups
      .list()
      .filter((n) => n.startsWith(PRE_IMPORT_BACKUP_PREFIX) && n.endsWith('.json'))
      .sort()
      .reverse();
    for (const old of kept.slice(MAX_PRE_IMPORT_BACKUPS)) backups.remove(old);
    return name;
  }

  // applied after the commit; healthSyncEnabled is device and permission
  // state and is never restored from a file (6.4 step 5)
  private applySettings(archive: DecodedArchive): void {
    const s = this.deps.settings;
    s.set('isOnboarded', archive.settings.isOnboarded);
    s.set('optimalSleepMinutes', archive.settings.optimalSleepMinutes);
    s.set('optimalWakeMinutes', archive.settings.optimalWakeMinutes);
    s.set('windDownReminderEnabled', archive.settings.windDownReminderEnabled);
    if (archive.appearance.themeMode) s.set('themeMode', archive.appearance.themeMode);
    if (archive.appearance.colorPalette) s.set('themePalette', archive.appearance.colorPalette);
  }
}
