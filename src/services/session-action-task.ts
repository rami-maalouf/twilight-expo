// registers the "TwilightSessionAction" headless task that
// TwilightSessionTaskService starts after a session notification button.
// must run when the bundle loads (index.ts), before expo-router: a headless
// start mounts no ui, so route modules never load. the work itself is
// required lazily so app startup does not pay for it.
import { AppRegistry, Platform } from 'react-native';

export const SESSION_ACTION_TASK = 'TwilightSessionAction';

export function registerSessionActionTask(): void {
  if (Platform.OS !== 'android') return;
  AppRegistry.registerHeadlessTask(SESSION_ACTION_TASK, () => async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runPendingPresses } = require('./notification-actions') as typeof import('./notification-actions');
    await runPendingPresses();
  });
}
