import { SettingsStore, type KeyValueStorage } from '../../data/settings-store';
import { migrate } from '../../data/db';
import { SessionRepo } from '../../data/session-repo';
import { createDemoSleepSessions, DEMO_SESSION_ID_PREFIX } from '../demo-mode';
import { DemoDataManager } from '../demo-data-manager';
import { memoryDb } from '../../../tests/helpers/memory-db';

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItemSync: (key) => map.get(key) ?? null,
    setItemSync: (key, value) => {
      map.set(key, value);
    },
  };
}

function localTime(epochMs: number): { hour: number; minute: number } {
  const date = new Date(epochMs);
  return { hour: date.getHours(), minute: date.getMinutes() };
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function normalizedBedtime(epochMs: number): number {
  const { hour, minute } = localTime(epochMs);
  const clockMinute = hour * 60 + minute;
  return clockMinute < 18 * 60 ? clockMinute + 24 * 60 : clockMinute;
}

describe('Twilight demo data', () => {
  const importedAt = new Date(2026, 7, 5, 12, 0, 0, 0).getTime();

  test('creates 100 consecutive sleep logs with realistic variation', () => {
    const sessions = createDemoSleepSessions(importedAt);
    const durations = sessions.map((session) => (session.endTime! - session.startTime) / 60_000);
    const bedtimes = sessions.map((session) => normalizedBedtime(session.startTime));
    const wakeTimes = sessions.map((session) => {
      const { hour, minute } = localTime(session.endTime!);
      return hour * 60 + minute;
    });
    const weekendIndexes = sessions
      .map((session, index) => ({ index, weekday: new Date(session.endTime!).getDay() }))
      .filter(({ weekday }) => weekday === 0 || weekday === 6)
      .map(({ index }) => index);
    const weekdayIndexes = sessions
      .map((session, index) => ({ index, weekday: new Date(session.endTime!).getDay() }))
      .filter(({ weekday }) => weekday !== 0 && weekday !== 6)
      .map(({ index }) => index);

    expect(sessions).toHaveLength(100);
    expect(sessions[0]).toMatchObject({
      id: `${DEMO_SESSION_ID_PREFIX}1`,
      tag: 'Demo Log',
      startTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    expect(sessions[99]).toMatchObject({ id: `${DEMO_SESSION_ID_PREFIX}100` });
    expect(Math.min(...durations)).toBe(300);
    expect(Math.max(...durations)).toBe(570);
    expect(standardDeviation(durations)).toBeGreaterThan(55);
    expect(Math.max(...bedtimes) - Math.min(...bedtimes)).toBeGreaterThan(240);
    expect(Math.max(...wakeTimes) - Math.min(...wakeTimes)).toBeGreaterThan(360);
    expect(average(weekendIndexes.map((index) => bedtimes[index]))).toBeGreaterThan(
      average(weekdayIndexes.map((index) => bedtimes[index])) + 30
    );
    expect(average(weekendIndexes.map((index) => wakeTimes[index]))).toBeGreaterThan(
      average(weekdayIndexes.map((index) => wakeTimes[index])) + 60
    );
    expect(average(weekendIndexes.map((index) => durations[index]))).toBeGreaterThan(
      average(weekdayIndexes.map((index) => durations[index])) + 20
    );

    for (let index = 1; index < sessions.length; index += 1) {
      const priorEnd = new Date(sessions[index - 1].endTime!);
      const nextEnd = new Date(sessions[index].endTime!);
      const expectedEnd = new Date(priorEnd);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      expect(nextEnd.toDateString()).toBe(expectedEnd.toDateString());
    }
  });

  test('removes only demo logs and restores the prior sleep schedule', () => {
    const db = memoryDb();
    migrate(db);
    const repo = new SessionRepo(db);
    const settings = new SettingsStore(memoryKv());
    settings.set('optimalSleepMinutes', 22 * 60 + 30);
    settings.set('optimalWakeMinutes', 7 * 60 + 15);
    repo.createManualLog({
      startTime: importedAt - 9 * 60 * 60_000,
      endTime: importedAt - 60 * 60_000,
      startTimeZone: 'America/Edmonton',
      endTimeZone: 'America/Edmonton',
    });
    const manager = new DemoDataManager(repo, settings);

    manager.importDemoData(importedAt);

    expect(repo.listValidSessions()).toHaveLength(101);
    expect(settings.get('isDemoDataActive')).toBe(true);
    expect(settings.get('isOnboarded')).toBe(true);
    expect(settings.get('optimalSleepMinutes')).toBe(0);
    expect(settings.get('optimalWakeMinutes')).toBe(7 * 60);

    manager.exitDemoData();

    expect(repo.listValidSessions()).toHaveLength(1);
    expect(settings.get('isDemoDataActive')).toBe(false);
    expect(settings.get('isOnboarded')).toBe(true);
    expect(settings.get('optimalSleepMinutes')).toBe(22 * 60 + 30);
    expect(settings.get('optimalWakeMinutes')).toBe(7 * 60 + 15);
  });
});
