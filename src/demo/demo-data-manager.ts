import type { SessionRepo } from '../data/session-repo';
import type { SettingsStore } from '../data/settings-store';
import { createDemoSleepSessions, DEMO_SESSION_ID_PREFIX } from './demo-mode';

export class DemoDataManager {
  constructor(
    private readonly sessionRepo: SessionRepo,
    private readonly settingsStore: SettingsStore
  ) {}

  importDemoData(now = Date.now()): void {
    if (!this.settingsStore.get('isDemoDataActive')) {
      this.settingsStore.saveDemoRestoreSettings({
        optimalSleepMinutes: this.settingsStore.get('optimalSleepMinutes'),
        optimalWakeMinutes: this.settingsStore.get('optimalWakeMinutes'),
      });
    }

    this.sessionRepo.replaceSessionsWithPrefix(DEMO_SESSION_ID_PREFIX, createDemoSleepSessions(now));
    this.settingsStore.set('optimalSleepMinutes', 0);
    this.settingsStore.set('optimalWakeMinutes', 7 * 60);
    this.settingsStore.set('isDemoDataActive', true);
    this.settingsStore.set('isOnboarded', true);
  }

  exitDemoData(): void {
    this.sessionRepo.deleteSessionsWithPrefix(DEMO_SESSION_ID_PREFIX);

    const restoreSettings = this.settingsStore.takeDemoRestoreSettings();
    if (restoreSettings) {
      this.settingsStore.set('optimalSleepMinutes', restoreSettings.optimalSleepMinutes);
      this.settingsStore.set('optimalWakeMinutes', restoreSettings.optimalWakeMinutes);
    }

    this.settingsStore.set('isDemoDataActive', false);
    this.settingsStore.set('isOnboarded', true);
  }
}
