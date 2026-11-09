import { formatDashboardDate, formatDayDate, formatMinuteTime, formatTime } from '../locale-format';

describe('locale-format', () => {
  const epoch = Date.UTC(2026, 6, 15, 22, 0, 0); // 22:00 UTC

  test('formatTime with 12h cycle', () => {
    const formatted = formatTime(epoch, { timeZone: 'UTC', hour12: true, locale: 'en-US' });
    expect(formatted).toBe('10:00 PM');
  });

  test('formatTime with 24h cycle', () => {
    const formatted = formatTime(epoch, { timeZone: 'UTC', hour12: false, locale: 'en-US' });
    expect(formatted).toBe('22:00');
  });

  test('formatMinuteTime with 12h cycle', () => {
    const formatted = formatMinuteTime(22 * 60, { hour12: true, locale: 'en-US' });
    expect(formatted).toBe('10:00 PM');
  });

  test('formatMinuteTime with 24h cycle', () => {
    const formatted = formatMinuteTime(22 * 60, { hour12: false, locale: 'en-US' });
    expect(formatted).toBe('22:00');
  });

  test('formatDayDate formats short weekday and month day', () => {
    const date = new Date(Date.UTC(2026, 6, 15));
    const formatted = formatDayDate(date, { locale: 'en-US', timeZone: 'UTC' });
    expect(formatted).toBe('Wed, Jul 15');
  });

  test('formatDashboardDate formats weekday, month, day', () => {
    const date = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
    const formatted = formatDashboardDate(date, 'en-US');
    expect(formatted).toContain('July 15');
  });
});
