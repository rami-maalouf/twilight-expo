import { getCalendars, getLocales } from 'expo-localization';

import {
  deviceClock,
  formatDashboardDate,
  formatDayDate,
  formatMinuteTime,
  formatShortDate,
  formatTime,
} from '../locale-format';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ uses24hourClock: false }]),
  getLocales: jest.fn(() => [{ languageTag: 'en-US' }]),
}));

const mockCalendars = getCalendars as jest.Mock;
const mockLocales = getLocales as jest.Mock;

describe('locale-format', () => {
  const tenPmUtc = Date.UTC(2026, 6, 15, 22, 0, 0);

  afterEach(() => {
    mockCalendars.mockImplementation(() => [{ uses24hourClock: false }]);
    mockLocales.mockImplementation(() => [{ languageTag: 'en-US' }]);
  });

  test('explicit 12 and 24 hour cycles', () => {
    expect(formatTime(tenPmUtc, { timeZone: 'UTC', hour12: true, locale: 'en-US' })).toBe('10:00 PM');
    expect(formatTime(tenPmUtc, { timeZone: 'UTC', hour12: false, locale: 'en-US' })).toBe('22:00');
  });

  test('follows the device 24-hour setting when no cycle is given', () => {
    expect(formatTime(tenPmUtc, { timeZone: 'UTC' })).toBe('10:00 PM');
    mockCalendars.mockImplementation(() => [{ uses24hourClock: true }]);
    expect(formatTime(tenPmUtc, { timeZone: 'UTC' })).toBe('22:00');
    expect(formatMinuteTime(7 * 60 + 5)).toBe('07:05');
  });

  test('keeps the session time zone', () => {
    expect(formatTime(tenPmUtc, { timeZone: 'America/Denver', hour12: true, locale: 'en-US' })).toBe('4:00 PM');
  });

  test('minute-of-day times wrap and use plain spaces', () => {
    expect(formatMinuteTime(22 * 60, { hour12: true, locale: 'en-US' })).toBe('10:00 PM');
    expect(formatMinuteTime(22 * 60, { hour12: false, locale: 'en-US' })).toBe('22:00');
    expect(formatMinuteTime(-60, { hour12: true, locale: 'en-US' })).toBe('11:00 PM');
    expect(formatMinuteTime(0, { hour12: true, locale: 'en-US' })).not.toMatch(/ /);
  });

  test('dates follow the device locale', () => {
    const day = new Date(Date.UTC(2026, 6, 15));
    expect(formatDayDate(day, { timeZone: 'UTC' })).toBe('Wed, Jul 15');
    expect(formatShortDate(day, { timeZone: 'UTC' })).toBe('Jul 15, 2026');
    mockLocales.mockImplementation(() => [{ languageTag: 'de-DE' }]);
    expect(formatDayDate(day, { timeZone: 'UTC' })).toBe('Mi., 15. Juli');
    expect(formatDashboardDate(new Date(2026, 6, 15, 12), 'en-US')).toBe('July 15, 2026');
  });

  test('device lookup failures fall back to the engine defaults', () => {
    mockCalendars.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(deviceClock()).toEqual({});
  });
});
