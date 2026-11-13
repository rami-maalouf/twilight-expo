// app entry: expo-router's entry plus the headless tasks, which must be
// registered while the bundle loads (a headless start mounts no route)
import 'expo-router/entry';

import { registerSessionActionTask } from './src/services/session-action-task';

registerSessionActionTask();
