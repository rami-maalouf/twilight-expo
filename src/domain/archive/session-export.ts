// ports: Utils/DataExporter.swift (csv and markdown session export,
// docs/health-connect.md 6.5). the port has one profile ("Sleep") and no
// breaks; break columns stay for format parity. repo style: "-" instead of
// the em dash and plain status words instead of emoji.
import { offsetSecondsAt } from '../health/zones';

export type ExportSortDirection = 'ascending' | 'descending';
export type ExportTimeZone = 'utc' | 'local';
export type ExportFormat = 'csv' | 'markdown';

export interface ExportSession {
  id: string;
  startTime: number;
  endTime: number | null;
}

export interface ExportOptions {
  sortDirection: ExportSortDirection;
  timeZone: ExportTimeZone;
  // device zone used for 'local'
  deviceZone: string;
  nowMs: number;
}

export const EXPORT_PROFILE_NAME = 'Sleep';

const pad = (n: number, width = 2) => String(Math.trunc(Math.abs(n))).padStart(width, '0');

// iso 8601 with ms (swift .withInternetDateTime + .withFractionalSeconds)
export function formatIsoDate(ms: number, timeZone: ExportTimeZone, deviceZone: string): string {
  const offset = timeZone === 'utc' ? 0 : (offsetSecondsAt(deviceZone, ms) ?? 0);
  if (offset === 0) return new Date(ms).toISOString();
  const wall = new Date(ms + offset * 1000).toISOString().slice(0, -1);
  const sign = offset > 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${wall}${sign}${pad(abs / 3600)}:${pad((abs % 3600) / 60)}`;
}

// swift formatDuration
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0m';
  const totalMinutes = Math.trunc(seconds / 60);
  const hours = Math.trunc(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

// rfc 4180 (swift escapeCSVField)
export function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replaceAll('"', '""')}"`;
  }
  return field;
}

function sorted(sessions: readonly ExportSession[], direction: ExportSortDirection): ExportSession[] {
  const list = [...sessions].sort((a, b) => a.startTime - b.startTime);
  return direction === 'ascending' ? list : list.reverse();
}

export function exportSessionsCsv(sessions: readonly ExportSession[], options: ExportOptions): string {
  const date = (ms: number) => formatIsoDate(ms, options.timeZone, options.deviceZone);
  const lines = ['session_id,profile_name,start_time,end_time,break_start_time,break_end_time'];
  for (const s of sorted(sessions, options.sortDirection)) {
    const row = [s.id, EXPORT_PROFILE_NAME, date(s.startTime), s.endTime == null ? '' : date(s.endTime), '', ''];
    lines.push(row.map(escapeCsvField).join(','));
  }
  return lines.join('\n');
}

const durationOf = (s: ExportSession) => (s.endTime == null ? 0 : (s.endTime - s.startTime) / 1000);

export function exportSessionsMarkdown(sessions: readonly ExportSession[], options: ExportOptions): string {
  const date = (ms: number) => formatIsoDate(ms, options.timeZone, options.deviceZone);
  const timeZoneLabel = options.timeZone === 'utc' ? 'UTC' : options.deviceZone;
  const sortLabel =
    options.sortDirection === 'ascending' ? 'Ascending (oldest first)' : 'Descending (newest first)';
  const list = sorted(sessions, options.sortDirection);
  const completed = list.filter((s) => s.endTime != null);
  const total = completed.reduce((sum, s) => sum + durationOf(s), 0);

  const lines = [
    '# Twilight Sleep Tracker - Data Export',
    '',
    '> This document contains structured sleep session data exported from the Twilight app.',
    '> It is formatted for use by AI agents and automated analysis tools.',
    '',
    '## Export Metadata',
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Generated At | ${date(options.nowMs)} |`,
    `| Timezone | ${timeZoneLabel} |`,
    `| Sort Order | ${sortLabel} |`,
    `| Profiles Included | ${list.length > 0 ? 1 : 0} |`,
    `| Total Sessions | ${list.length} |`,
    `| Completed Sessions | ${completed.length} |`,
    '| Sessions with Breaks | 0 |',
    `| Total Sleep Time | ${formatDuration(total)} |`,
    '',
    '## Aggregate Summary',
    '',
  ];

  if (completed.length === 0) {
    lines.push('_No completed sessions in this export._', '');
  } else {
    const durations = completed.map(durationOf);
    lines.push(
      '| Metric | Value |',
      '|--------|-------|',
      `| Average Session Duration | ${formatDuration(total / completed.length)} |`,
      `| Longest Session | ${formatDuration(Math.max(...durations))} |`,
      `| Shortest Session | ${formatDuration(Math.min(...durations))} |`,
      `| Earliest Start | ${date(Math.min(...completed.map((s) => s.startTime)))} |`,
      `| Latest End | ${date(Math.max(...completed.map((s) => s.endTime as number)))} |`,
      ''
    );
  }

  lines.push('## Profiles', '');
  if (list.length > 0) {
    lines.push(
      `### ${EXPORT_PROFILE_NAME}`,
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Sessions | ${list.length} |`,
      `| Completed Sessions | ${completed.length} |`,
      `| Total Sleep Time | ${formatDuration(total)} |`,
      `| Average Duration | ${formatDuration(completed.length === 0 ? 0 : total / completed.length)} |`,
      ''
    );
  }

  lines.push('## Session Log', '', 'Each session represents a single sleep period.', '');
  if (list.length === 0) {
    lines.push('_No sessions to display._', '');
  } else {
    list.forEach((s, index) => {
      lines.push(
        `### Session ${index + 1} - ${EXPORT_PROFILE_NAME}`,
        '',
        '| Field | Value |',
        '|-------|-------|',
        `| Status | ${s.endTime == null ? 'In Progress' : 'Completed'} |`,
        `| Session ID | \`${s.id}\` |`,
        `| Profile | ${EXPORT_PROFILE_NAME} |`,
        `| Start Time | ${date(s.startTime)} |`,
        `| End Time | ${s.endTime == null ? '-' : date(s.endTime)} |`,
        `| Duration | ${s.endTime == null ? '-' : formatDuration(durationOf(s))} |`,
        '| Break Start | - |',
        '| Break End | - |',
        '| Break Duration | - |',
        ''
      );
    });
  }

  lines.push('---', '', `_Exported by Twilight · All timestamps are in ${timeZoneLabel} · ISO 8601 format_`);
  return lines.join('\n');
}
