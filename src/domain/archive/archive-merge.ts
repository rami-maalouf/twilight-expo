// ports: DataArchiveManager.swift previewImport / importArchive merge rules
// and DataArchivePreview.confirmationMessage (docs/health-connect.md 6.4).
// pure: decides what an import writes; src/data/archive-repo.ts applies it.
import { isDemoSession } from '../health/ownership';
import { nextSyncVersion } from '../health/outbound';
import type { Tombstone } from '../health/types';
import type { ThemeMode, ThemePalette } from '../models';
import type { ArchivedSession, DecodedArchive } from './archive-format';

export interface LocalArchiveState {
  sessions: readonly ArchivedSession[];
  settings: {
    isOnboarded: boolean;
    optimalSleepMinutes: number;
    optimalWakeMinutes: number;
    windDownReminderEnabled: boolean;
  };
  appearance: { themeMode: ThemeMode; colorPalette: ThemePalette };
}

export interface ImportPreview {
  source: DecodedArchive['source'];
  exportedAt: number;
  appVersion: string | null;
  sessionCount: number;
  newSessions: number;
  updatedSessions: number;
  settingsChanges: number;
  appearanceChanges: number;
  hasActiveSessionConflict: boolean;
}

export interface ImportPlan {
  preview: ImportPreview;
  // sessions to insert or overwrite, with the sync fields they get
  inserts: ArchivedSession[];
  updates: ArchivedSession[];
  // the incoming active session skipped because one is already active (6.4 step 4)
  skippedActiveId: string | null;
  tombstones: Tombstone[];
}

// a session is owned (exported to health connect) when it is neither an
// import nor an edited import and has no provider (outbound.isOwnedForExport)
export function isOwnedSession(s: Pick<ArchivedSession, 'imported' | 'adopted' | 'provider'>): boolean {
  return !s.imported && !s.adopted && s.provider == null;
}

// the night's content; sync bookkeeping is not content, so re-importing a
// backup after a sync does not count every night as updated
export function sameSessionContent(a: ArchivedSession, b: ArchivedSession): boolean {
  return (
    a.tag === b.tag &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime &&
    a.startTimeZone === b.startTimeZone &&
    a.endTimeZone === b.endTimeZone &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a.imported === b.imported &&
    a.adopted === b.adopted &&
    a.provider === b.provider &&
    a.nightKey === b.nightKey &&
    a.sourceId === b.sourceId
  );
}

function countSettingsChanges(local: LocalArchiveState, archive: DecodedArchive): number {
  const keys = ['isOnboarded', 'optimalSleepMinutes', 'optimalWakeMinutes', 'windDownReminderEnabled'] as const;
  return keys.filter((key) => local.settings[key] !== archive.settings[key]).length;
}

function countAppearanceChanges(local: LocalArchiveState, archive: DecodedArchive): number {
  const { themeMode, colorPalette } = archive.appearance;
  return (
    (themeMode != null && themeMode !== local.appearance.themeMode ? 1 : 0) +
    (colorPalette != null && colorPalette !== local.appearance.colorPalette ? 1 : 0)
  );
}

// merge by id: the archive record overwrites, local-only sessions stay.
// owned nights that are new or changed become pending with a clock version
// above both the file's and the local one (3.3; swift copies the file's sync
// flags, which on health connect would let an older record silently win)
export function planImport(archive: DecodedArchive, local: LocalArchiveState, nowMs: number): ImportPlan {
  const localById = new Map(local.sessions.map((s) => [s.id, s]));
  const localActive = local.sessions.find((s) => s.endTime == null) ?? null;
  const incoming = archive.sessions.filter((s) => !isDemoSession(s));
  const inserts: ArchivedSession[] = [];
  const updates: ArchivedSession[] = [];
  let skippedActiveId: string | null = null;

  for (const s of incoming) {
    const current = localById.get(s.id);
    if (s.endTime == null && localActive) {
      if (!current || !sameSessionContent(current, s)) skippedActiveId = s.id;
      continue;
    }
    if (current && sameSessionContent(current, s)) continue;
    const owned = isOwnedSession(s);
    const floor = Math.max(current?.healthSyncVersion ?? 0, s.healthSyncVersion);
    const restored: ArchivedSession = {
      ...s,
      needsHealthSync: owned,
      healthSyncVersion: owned ? nextSyncVersion(floor, nowMs) : floor,
    };
    (current ? updates : inserts).push(restored);
  }

  return {
    preview: {
      source: archive.source,
      exportedAt: archive.exportedAt,
      appVersion: archive.appVersion,
      sessionCount: incoming.length,
      newSessions: inserts.length,
      updatedSessions: updates.length,
      settingsChanges: countSettingsChanges(local, archive),
      appearanceChanges: countAppearanceChanges(local, archive),
      hasActiveSessionConflict: skippedActiveId != null,
    },
    inserts,
    updates,
    skippedActiveId,
    tombstones: archive.tombstones,
  };
}

// swift DataArchivePreview.confirmationMessage without profiles and scheduler
export function confirmationMessage(preview: ImportPreview, formatDate: (ms: number) => string): string {
  const lines = ['Are you sure you want to import this data?', '', `Exported: ${formatDate(preview.exportedAt)}.`];
  if (preview.appVersion) lines.push(`Backup app version: ${preview.appVersion}.`);
  if (preview.source === 'swift') {
    lines.push('This backup is from Twilight for iPhone. Only sleep sessions and sleep settings are imported.');
  }
  lines.push(
    'This import merges with your current data and does not delete local records.',
    `Sessions: ${preview.sessionCount} total, ${preview.newSessions} new, ${preview.updatedSessions} updated.`
  );
  if (preview.settingsChanges > 0) lines.push(`Sleep settings changes: ${preview.settingsChanges}.`);
  if (preview.appearanceChanges > 0) lines.push(`Appearance changes: ${preview.appearanceChanges}.`);
  if (preview.hasActiveSessionConflict) {
    lines.push("Your device already has an active session; it stays active and the backup's active session is skipped.");
  }
  lines.push('A full backup of your current data will be created automatically before import.');
  return lines.join('\n');
}

export function successMessage(preview: ImportPreview, backupName: string): string {
  return [
    `Sessions imported: ${preview.newSessions} new, ${preview.updatedSessions} updated.`,
    `Safety backup saved as ${backupName}.`,
  ].join('\n');
}
