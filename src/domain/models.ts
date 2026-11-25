// ports: Models/BlockedProfileSessions.swift (sleep-relevant fields), Models/SleepSettings.swift
// pure ts - no react or expo imports allowed in src/domain

export interface SleepSession {
  id: string;
  // "Manual Log" for editor-created entries
  tag: string;
  // epoch ms
  startTime: number;
  // epoch ms; null = active session
  endTime: number | null;
  // iana identifiers - timezone correctness is load-bearing
  startTimeZone: string;
  endTimeZone: string | null;
  createdAt: number;
  updatedAt: number;
  // health sync ownership; filled by the repository, absent in pure fixtures
  health?: SessionHealth;
}

// docs/health-connect.md 3.4
export interface SessionHealth {
  // health-owned import (swift isHealthKitImported)
  imported: boolean;
  // edited import: owned locally, never written to health connect
  adopted: boolean;
  provider: 'health_connect' | 'healthkit' | null;
  nightKey: string | null;
  sourceId: string | null;
  needsSync: boolean;
  syncVersion: number;
  hcRecordId: string | null;
  hcRemoteVersion: number | null;
}

export type ThemeMode = 'system' | 'light' | 'dark';
export type ThemePalette = 'twilight' | 'amethyst';

export interface SleepSettingsData {
  isOnboarded: boolean;
  isDemoDataActive: boolean;
  // minutes since midnight; defaults 22:00 / 07:00 per SleepSettings.swift
  optimalSleepMinutes: number;
  optimalWakeMinutes: number;
  windDownReminderEnabled: boolean;
  themeMode: ThemeMode;
  themePalette: ThemePalette;
  liveActivityEnabled: boolean;
  liveActivityId: string | null;
  // android health connect sync switch (swift healthSyncEnabled); off by default
  healthSyncEnabled: boolean;
}

export const DEFAULT_SETTINGS: SleepSettingsData = {
  isOnboarded: false,
  isDemoDataActive: false,
  optimalSleepMinutes: 22 * 60,
  optimalWakeMinutes: 7 * 60,
  windDownReminderEnabled: true,
  themeMode: 'dark',
  themePalette: 'twilight',
  liveActivityEnabled: true,
  liveActivityId: null,
  healthSyncEnabled: false,
};

// a wall-clock calendar day (month is 1-based), independent of any timezone instant
export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}
