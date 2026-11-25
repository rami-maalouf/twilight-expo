// DataExporter.swift parity: csv and markdown session export (docs/health-connect.md 6.5)
import {
  escapeCsvField,
  exportSessionsCsv,
  exportSessionsMarkdown,
  formatDuration,
  formatIsoDate,
  type ExportOptions,
} from '../session-export';

const T0 = Date.UTC(2026, 10, 1, 22, 0);
const H = 3600_000;

const sessions = [
  { id: 'b', startTime: T0 + 24 * H, endTime: T0 + 31.5 * H },
  { id: 'a', startTime: T0, endTime: T0 + 8 * H },
  { id: 'live', startTime: T0 + 48 * H, endTime: null },
];

const options = (overrides: Partial<ExportOptions> = {}): ExportOptions => ({
  sortDirection: 'ascending',
  timeZone: 'utc',
  deviceZone: 'America/New_York',
  nowMs: T0 + 50 * H,
  ...overrides,
});

describe('session export', () => {
  test('iso dates with ms in utc or the device zone', () => {
    expect(formatIsoDate(T0, 'utc', 'America/New_York')).toBe('2026-11-01T22:00:00.000Z');
    expect(formatIsoDate(T0, 'local', 'America/New_York')).toBe('2026-11-01T17:00:00.000-05:00');
    expect(formatIsoDate(T0, 'local', 'Asia/Kolkata')).toBe('2026-11-02T03:30:00.000+05:30');
    expect(formatIsoDate(T0, 'local', 'UTC')).toBe('2026-11-01T22:00:00.000Z');
  });

  test('duration and csv escaping match swift', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45 * 60)).toBe('45m');
    expect(formatDuration(8 * 3600)).toBe('8h');
    expect(formatDuration(7.5 * 3600)).toBe('7h 30m');
    expect(escapeCsvField('plain')).toBe('plain');
    expect(escapeCsvField('a,b')).toBe('"a,b"');
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField('two\nlines')).toBe('"two\nlines"');
  });

  test('csv: swift header, sorted by start, empty end for the active session', () => {
    expect(exportSessionsCsv(sessions, options()).split('\n')).toEqual([
      'session_id,profile_name,start_time,end_time,break_start_time,break_end_time',
      'a,Sleep,2026-11-01T22:00:00.000Z,2026-11-02T06:00:00.000Z,,',
      'b,Sleep,2026-11-02T22:00:00.000Z,2026-11-03T05:30:00.000Z,,',
      'live,Sleep,2026-11-03T22:00:00.000Z,,,',
    ]);
    expect(exportSessionsCsv(sessions, options({ sortDirection: 'descending' })).split('\n').map((l) => l.split(',')[0])).toEqual([
      'session_id',
      'live',
      'b',
      'a',
    ]);
    expect(exportSessionsCsv([], options())).toBe('session_id,profile_name,start_time,end_time,break_start_time,break_end_time');
  });

  test('markdown snapshot', () => {
    expect(exportSessionsMarkdown(sessions, options({ timeZone: 'local' }))).toMatchSnapshot();
  });

  test('markdown with no sessions', () => {
    const md = exportSessionsMarkdown([], options());
    expect(md).toContain('| Profiles Included | 0 |');
    expect(md).toContain('_No completed sessions in this export._');
    expect(md).toContain('_No sessions to display._');
    expect(md).not.toContain('\u2014');
  });
});
