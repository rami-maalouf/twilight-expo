// ports: Utils/DataArchiveManager.swift (payload, validation, error copy)
// with the port's own archive type (docs/health-connect.md 6.1-6.3).
// pure ts: decode and validate a backup, encode one with sorted keys.
import type { HealthProvider, Tombstone } from '../health/types';
import { isValidTimeZone } from '../health/zones';
import type { ThemeMode, ThemePalette } from '../models';

export const ARCHIVE_TYPE = 'twilight-expo-backup';
export const CURRENT_SCHEMA_VERSION = 1;
export const MINIMUM_SUPPORTED_SCHEMA_VERSION = 1;
// read-only migration path from the swift app (6.3)
export const SWIFT_ARCHIVE_TYPE = 'twilight-full-backup';
export const SWIFT_SCHEMA_VERSIONS = { min: 1, max: 2 } as const;

const MAX_MINUTES = 24 * 60 - 1;

// the json shapes as written to disk (iso 8601 dates with ms)

export interface ArchiveMetadataRecord {
  archiveType: string;
  schemaVersion: number;
  exportedAt: string;
  timeZoneIdentifier: string;
  appVersion: string | null;
  platform: string;
}

export interface ArchiveSleepSettingsRecord {
  isOnboarded: boolean;
  optimalSleepMinutes: number;
  optimalWakeMinutes: number;
  windDownReminderEnabled: boolean;
  healthSyncEnabled: boolean;
}

export interface ArchiveAppearanceRecord {
  themeMode: ThemeMode;
  colorPalette: ThemePalette;
}

export interface ArchiveSessionRecord {
  id: string;
  tag: string;
  startTime: string;
  endTime: string | null;
  startTimeZoneIdentifier: string;
  endTimeZoneIdentifier: string | null;
  createdAt: string;
  updatedAt: string;
  needsHealthSync: boolean;
  healthSyncVersion: number;
  isHealthImported: boolean;
  isHealthAdopted: boolean;
  healthProvider: HealthProvider | null;
  healthExternalNightKey: string | null;
  healthSourceIdentifier: string | null;
}

export interface ArchiveTombstoneRecord {
  nightKey: string;
  deletedAt: string;
  recordIds: string[];
}

export interface ArchivePayload {
  metadata: ArchiveMetadataRecord;
  sleepSettings: ArchiveSleepSettingsRecord;
  appearance: ArchiveAppearanceRecord;
  sessions: ArchiveSessionRecord[];
  healthSleepTombstones: ArchiveTombstoneRecord[];
}

// the decoded, normalized form both archive types map to (epoch ms)

export interface ArchivedSession {
  id: string;
  tag: string;
  startTime: number;
  endTime: number | null;
  startTimeZone: string;
  endTimeZone: string | null;
  createdAt: number;
  updatedAt: number;
  needsHealthSync: boolean;
  healthSyncVersion: number;
  imported: boolean;
  adopted: boolean;
  provider: HealthProvider | null;
  nightKey: string | null;
  sourceId: string | null;
}

export interface DecodedArchive {
  source: 'port' | 'swift';
  exportedAt: number;
  appVersion: string | null;
  settings: Omit<ArchiveSleepSettingsRecord, 'healthSyncEnabled'>;
  // null: the swift value has no port equivalent, keep the current one
  appearance: { themeMode: ThemeMode | null; colorPalette: ThemePalette | null };
  sessions: ArchivedSession[];
  tombstones: Tombstone[];
}

export type ArchiveErrorCode =
  | 'notBackup'
  | 'unsupportedSchema'
  | 'duplicateSession'
  | 'invalidSession'
  | 'multipleActiveSessions'
  | 'invalidSettings'
  | 'unreadableFile';

// swift DataArchiveError copy, adapted (6.2); the message is user-facing
export class ArchiveError extends Error {
  constructor(
    readonly code: ArchiveErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ArchiveError';
  }

  static notBackup() {
    return new ArchiveError('notBackup', 'This file is not a Twilight backup.');
  }
  static unsupportedSchema(version: number) {
    return new ArchiveError(
      'unsupportedSchema',
      `This backup uses schema version ${version}, which this app version cannot import.`
    );
  }
  static duplicateSession(id: string) {
    return new ArchiveError('duplicateSession', `The backup contains duplicate session IDs (${id}).`);
  }
  static invalidSession(id: string) {
    return new ArchiveError('invalidSession', `This backup contains an invalid sleep session (${id}).`);
  }
  static multipleActiveSessions() {
    return new ArchiveError('multipleActiveSessions', 'This backup contains more than one active sleep session.');
  }
  static invalidSettings(field: string) {
    return new ArchiveError('invalidSettings', `This backup contains invalid settings (${field}).`);
  }
  static unreadableFile() {
    return new ArchiveError('unreadableFile', 'The selected file could not be read.');
  }
}

// ---------- encoding ----------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

// swift: JSONEncoder .prettyPrinted + .sortedKeys, iso 8601 dates
export function encodeArchive(payload: ArchivePayload): string {
  return JSON.stringify(sortKeys(payload), null, 2);
}

const iso = (ms: number) => new Date(ms).toISOString();

export function toSessionRecord(s: ArchivedSession): ArchiveSessionRecord {
  return {
    id: s.id,
    tag: s.tag,
    startTime: iso(s.startTime),
    endTime: s.endTime == null ? null : iso(s.endTime),
    startTimeZoneIdentifier: s.startTimeZone,
    endTimeZoneIdentifier: s.endTimeZone,
    createdAt: iso(s.createdAt),
    updatedAt: iso(s.updatedAt),
    needsHealthSync: s.needsHealthSync,
    healthSyncVersion: s.healthSyncVersion,
    isHealthImported: s.imported,
    isHealthAdopted: s.adopted,
    healthProvider: s.provider,
    healthExternalNightKey: s.nightKey,
    healthSourceIdentifier: s.sourceId,
  };
}

export function toTombstoneRecord(t: Tombstone): ArchiveTombstoneRecord {
  return { nightKey: t.nightKey, deletedAt: iso(t.deletedAt), recordIds: [...t.recordIds].sort() };
}

export interface ArchiveSource {
  sessions: readonly ArchivedSession[];
  tombstones: readonly Tombstone[];
  settings: ArchiveSleepSettingsRecord;
  appearance: ArchiveAppearanceRecord;
  nowMs: number;
  timeZoneIdentifier: string;
  appVersion: string | null;
  platform: string;
}

// swift makeArchive: sessions by start time, tombstones by night key
export function buildArchivePayload(source: ArchiveSource): ArchivePayload {
  return {
    metadata: {
      archiveType: ARCHIVE_TYPE,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: iso(source.nowMs),
      timeZoneIdentifier: source.timeZoneIdentifier,
      appVersion: source.appVersion,
      platform: source.platform,
    },
    sleepSettings: { ...source.settings },
    appearance: { ...source.appearance },
    sessions: [...source.sessions].sort((a, b) => a.startTime - b.startTime).map(toSessionRecord),
    healthSleepTombstones: [...source.tombstones]
      .sort((a, b) => a.nightKey.localeCompare(b.nightKey))
      .map(toTombstoneRecord),
  };
}

// ---------- decoding ----------

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v != null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function parseDate(v: unknown): number | null {
  if (!isString(v)) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

function optionalString(v: unknown): string | null | undefined {
  if (v == null) return null;
  return isString(v) ? v : undefined;
}

function minutes(v: unknown, field: string): number {
  if (!isInt(v) || v < 0 || v > MAX_MINUTES) throw ArchiveError.invalidSettings(field);
  return v;
}

function bool(v: unknown, field: string): boolean {
  if (!isBool(v)) throw ArchiveError.invalidSettings(field);
  return v;
}

const THEME_MODES: readonly ThemeMode[] = ['system', 'light', 'dark'];
const PALETTES: readonly ThemePalette[] = ['twilight', 'amethyst'];
const PROVIDERS: readonly HealthProvider[] = ['health_connect', 'healthkit'];

// swift ThemeManager raw values (6.3)
const SWIFT_THEME_MODES: Record<string, ThemeMode> = { System: 'system', Sunset: 'light', 'Night Sky': 'dark' };
const SWIFT_PALETTES: Record<string, ThemePalette> = { Twilight: 'twilight', Amethyst: 'amethyst' };

function parseJson(text: string): Json {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw ArchiveError.notBackup();
  }
  if (!isObject(parsed) || !isObject(parsed.metadata)) throw ArchiveError.notBackup();
  return parsed;
}

// swift validate: archive type, schema range, duplicate ids; port additions:
// end after start, at most one active session, valid zones, enum values
function validateSessions(sessions: ArchivedSession[]): void {
  const ids = new Set<string>();
  let active = 0;
  for (const s of sessions) {
    if (ids.has(s.id)) throw ArchiveError.duplicateSession(s.id);
    ids.add(s.id);
    if (s.endTime == null) active += 1;
  }
  if (active > 1) throw ArchiveError.multipleActiveSessions();
}

function sessionIdOf(raw: unknown, index: number): string {
  return isObject(raw) && isString(raw.id) && raw.id.length > 0 ? raw.id : `#${index + 1}`;
}

function checkSession(s: ArchivedSession): ArchivedSession {
  const valid =
    s.id.length > 0 &&
    Number.isFinite(s.startTime) &&
    (s.endTime == null || s.endTime > s.startTime) &&
    isValidTimeZone(s.startTimeZone) &&
    (s.endTimeZone == null || isValidTimeZone(s.endTimeZone)) &&
    !(s.imported && s.adopted) &&
    (!(s.imported || s.adopted) || s.provider != null) &&
    Number.isFinite(s.healthSyncVersion) &&
    s.healthSyncVersion >= 0;
  if (!valid) throw ArchiveError.invalidSession(s.id);
  return s;
}

function decodePortSession(raw: unknown, index: number): ArchivedSession {
  const id = sessionIdOf(raw, index);
  if (!isObject(raw)) throw ArchiveError.invalidSession(id);
  const startTime = parseDate(raw.startTime);
  const endTime = raw.endTime == null ? null : parseDate(raw.endTime);
  const endTimeZone = optionalString(raw.endTimeZoneIdentifier);
  const provider = raw.healthProvider == null ? null : raw.healthProvider;
  const nightKey = optionalString(raw.healthExternalNightKey);
  const sourceId = optionalString(raw.healthSourceIdentifier);
  const createdAt = raw.createdAt == null ? startTime : parseDate(raw.createdAt);
  const updatedAt = raw.updatedAt == null ? (endTime ?? startTime) : parseDate(raw.updatedAt);
  if (
    !isString(raw.id) ||
    !isString(raw.tag) ||
    startTime == null ||
    (raw.endTime != null && endTime == null) ||
    !isString(raw.startTimeZoneIdentifier) ||
    endTimeZone === undefined ||
    nightKey === undefined ||
    sourceId === undefined ||
    createdAt == null ||
    updatedAt == null ||
    (provider != null && !PROVIDERS.includes(provider as HealthProvider)) ||
    (raw.needsHealthSync != null && !isBool(raw.needsHealthSync)) ||
    (raw.healthSyncVersion != null && !isInt(raw.healthSyncVersion)) ||
    (raw.isHealthImported != null && !isBool(raw.isHealthImported)) ||
    (raw.isHealthAdopted != null && !isBool(raw.isHealthAdopted))
  ) {
    throw ArchiveError.invalidSession(id);
  }
  return checkSession({
    id: raw.id,
    tag: raw.tag,
    startTime,
    endTime,
    startTimeZone: raw.startTimeZoneIdentifier,
    endTimeZone,
    createdAt,
    updatedAt,
    needsHealthSync: (raw.needsHealthSync as boolean | undefined) ?? true,
    healthSyncVersion: (raw.healthSyncVersion as number | undefined) ?? 0,
    imported: (raw.isHealthImported as boolean | undefined) ?? false,
    adopted: (raw.isHealthAdopted as boolean | undefined) ?? false,
    provider: provider as HealthProvider | null,
    nightKey,
    sourceId,
  });
}

function decodeTombstones(raw: unknown, withRecordIds: boolean): Tombstone[] {
  // swift parity: a missing key decodes as []
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw ArchiveError.notBackup();
  return raw.map((t) => {
    const deletedAt = isObject(t) ? parseDate(t.deletedAt) : null;
    if (!isObject(t) || !isString(t.nightKey) || deletedAt == null) throw ArchiveError.notBackup();
    const recordIds =
      withRecordIds && Array.isArray(t.recordIds) ? t.recordIds.filter((id): id is string => isString(id)) : [];
    return { nightKey: t.nightKey, deletedAt, recordIds };
  });
}

function decodeSettings(raw: unknown): DecodedArchive['settings'] {
  if (!isObject(raw)) throw ArchiveError.notBackup();
  return {
    isOnboarded: bool(raw.isOnboarded, 'isOnboarded'),
    optimalSleepMinutes: minutes(raw.optimalSleepMinutes, 'optimalSleepMinutes'),
    optimalWakeMinutes: minutes(raw.optimalWakeMinutes, 'optimalWakeMinutes'),
    windDownReminderEnabled: bool(raw.windDownReminderEnabled, 'windDownReminderEnabled'),
  };
}

function decodePort(json: Json, exportedAt: number, appVersion: string | null): DecodedArchive {
  const appearance = json.appearance;
  if (!isObject(appearance)) throw ArchiveError.notBackup();
  if (!THEME_MODES.includes(appearance.themeMode as ThemeMode)) throw ArchiveError.invalidSettings('themeMode');
  if (!PALETTES.includes(appearance.colorPalette as ThemePalette)) throw ArchiveError.invalidSettings('colorPalette');
  if (!Array.isArray(json.sessions)) throw ArchiveError.notBackup();
  const sessions = json.sessions.map(decodePortSession);
  validateSessions(sessions);
  return {
    source: 'port',
    exportedAt,
    appVersion,
    settings: decodeSettings(json.sleepSettings),
    appearance: { themeMode: appearance.themeMode as ThemeMode, colorPalette: appearance.colorPalette as ThemePalette },
    sessions,
    tombstones: decodeTombstones(json.healthSleepTombstones, true),
  };
}

// swift DataArchiveSessionRecord -> port session (6.3). healthkit imports and
// adopted healthkit nights stay local and are never exported to health connect
function decodeSwiftSession(raw: unknown, index: number, fallbackZone: string): ArchivedSession {
  const id = sessionIdOf(raw, index);
  if (!isObject(raw)) throw ArchiveError.invalidSession(id);
  const startTime = parseDate(raw.startTime);
  const endTime = raw.endTime == null ? null : parseDate(raw.endTime);
  const startZone = optionalString(raw.startTimeZoneIdentifier);
  const endZone = optionalString(raw.endTimeZoneIdentifier);
  const nightKey = optionalString(raw.healthKitExternalNightKey);
  const sourceId = optionalString(raw.healthKitSourceBundleIdentifier);
  if (
    !isString(raw.id) ||
    !isString(raw.tag) ||
    startTime == null ||
    (raw.endTime != null && endTime == null) ||
    startZone === undefined ||
    endZone === undefined ||
    nightKey === undefined ||
    sourceId === undefined ||
    (raw.needsHealthKitSync != null && !isBool(raw.needsHealthKitSync)) ||
    (raw.healthKitSyncVersion != null && !isInt(raw.healthKitSyncVersion)) ||
    (raw.isHealthKitImported != null && !isBool(raw.isHealthKitImported))
  ) {
    throw ArchiveError.invalidSession(id);
  }
  const imported = raw.isHealthKitImported === true;
  const adopted = !imported && nightKey != null;
  return checkSession({
    id: raw.id,
    tag: raw.tag,
    startTime,
    endTime,
    startTimeZone: startZone ?? fallbackZone,
    endTimeZone: endTime == null ? null : (endZone ?? startZone ?? fallbackZone),
    createdAt: startTime,
    updatedAt: endTime ?? startTime,
    needsHealthSync: imported || adopted ? false : ((raw.needsHealthKitSync as boolean | undefined) ?? true),
    healthSyncVersion: (raw.healthKitSyncVersion as number | undefined) ?? 0,
    imported,
    adopted,
    provider: imported || adopted ? 'healthkit' : null,
    nightKey,
    sourceId,
  });
}

function decodeSwift(json: Json, exportedAt: number, appVersion: string | null, zone: string): DecodedArchive {
  const settings = json.sleepSettings;
  const appearance = json.appearance;
  if (!isObject(settings) || !isObject(appearance) || !Array.isArray(json.sessions)) {
    throw ArchiveError.notBackup();
  }
  // only the sleep profile's sessions (all of them when no profile is set)
  const profileId = isString(settings.sleepProfileId) ? settings.sleepProfileId : null;
  const rawSessions = json.sessions.filter(
    (s) => profileId == null || !isObject(s) || s.blockedProfileId === profileId
  );
  const sessions = rawSessions.map((s, i) => decodeSwiftSession(s, i, zone));
  validateSessions(sessions);
  return {
    source: 'swift',
    exportedAt,
    appVersion,
    settings: decodeSettings(settings),
    appearance: {
      themeMode: SWIFT_THEME_MODES[String(appearance.themeMode)] ?? null,
      colorPalette: SWIFT_PALETTES[String(appearance.colorPalette)] ?? null,
    },
    sessions,
    tombstones: decodeTombstones(json.healthKitSleepTombstones, false),
  };
}

// decode + validate (swift decodeArchive). throws ArchiveError with user copy
export function decodeArchive(text: string): DecodedArchive {
  const json = parseJson(text);
  const metadata = json.metadata as Json;
  const { archiveType, schemaVersion } = metadata;
  if (archiveType !== ARCHIVE_TYPE && archiveType !== SWIFT_ARCHIVE_TYPE) throw ArchiveError.notBackup();
  if (!isInt(schemaVersion)) throw ArchiveError.notBackup();
  const exportedAt = parseDate(metadata.exportedAt);
  const zone = isString(metadata.timeZoneIdentifier) ? metadata.timeZoneIdentifier : null;
  if (exportedAt == null || zone == null) throw ArchiveError.notBackup();
  const appVersion = isString(metadata.appVersion) && metadata.appVersion.length > 0 ? metadata.appVersion : null;

  if (archiveType === ARCHIVE_TYPE) {
    if (schemaVersion < MINIMUM_SUPPORTED_SCHEMA_VERSION || schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw ArchiveError.unsupportedSchema(schemaVersion);
    }
    return decodePort(json, exportedAt, appVersion);
  }
  if (schemaVersion < SWIFT_SCHEMA_VERSIONS.min || schemaVersion > SWIFT_SCHEMA_VERSIONS.max) {
    throw ArchiveError.unsupportedSchema(schemaVersion);
  }
  return decodeSwift(json, exportedAt, appVersion, isValidTimeZone(zone) ? zone : 'UTC');
}
