// app-side wiring: opens the real expo-sqlite database and kv-store.
// kept separate from db.ts so the repository stays testable in node.
// production default: empty DB + onboarding. demo seed only when
// EXPO_PUBLIC_DEMO_MODE=1 (see package.json start:demo / ios:demo).
import { openDatabaseSync } from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';

import { ArchiveRepo } from './archive-repo';
import { migrate } from './db';
import { SessionRepo } from './session-repo';
import { SettingsStore } from './settings-store';
import { DemoDataManager } from '../demo/demo-data-manager';
import { isDemoMode } from '../demo/demo-mode';

const db = openDatabaseSync('twilight.db');
migrate(db);

const sessionRepo = new SessionRepo(db);
const archiveRepo = new ArchiveRepo(db);
const settingsStore = new SettingsStore(Storage);
const demoDataManager = new DemoDataManager(sessionRepo, settingsStore);

if (isDemoMode) {
  demoDataManager.importDemoData();
  settingsStore.set('themeMode', 'dark');
  settingsStore.set('windDownReminderEnabled', false);
}

export { archiveRepo, demoDataManager, sessionRepo, settingsStore };
