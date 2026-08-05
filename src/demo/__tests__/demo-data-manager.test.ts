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

describe('Twilight demo data', () => {
  const importedAt = new Date(2026, 7, 5, 12, 0, 0, 0).getTime();

  test('ports the active healthy preset as 100 consecutive sleep logs', () => {
    const sessions = createDemoSleepSessions(importedAt);

    expect(sessions).toHaveLength(100);
    expect(sessions[0]).toMatchObject({
      id: `${DEMO_SESSION_ID_PREFIX}1`,
      tag: 'Demo Log',
      startTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    });
    expect(sessions[99]).toMatchObject({ id: `${DEMO_SESSION_ID_PREFIX}100` });
    expect(sessions[0].endTime! - sessions[0].startTime).toBe(390 * 60_000);
    expect(sessions[99].endTime! - sessions[99].startTime).toBe(435 * 60_000);
    expect(localTime(sessions[0].startTime)).toEqual({ hour: 23, minute: 40 });
    expect(localTime(sessions[99].endTime!)).toEqual({ hour: 7, minute: 25 });

    for (let index = 1; index < sessions.length; index += 1) {
      const priorEnd = new Date(sessions[index - 1].endTime!);
      const nextEnd = new Date(sessions[index].endTime!);
      expect(nextEnd.getDate()).not.toBe(priorEnd.getDate());
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
