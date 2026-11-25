// incoming system urls: twilight://sleep/start|stop are actions, not routes.
// queue them for the root layout and land on home, so no unmatched-route
// screen flashes on cold or warm start
import { parseSleepLink, queueLaunchSleepLink, queueSleepLinkAction } from '@/services/sleep-links';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    const action = parseSleepLink(path);
    if (action == null) return path;
    if (initial) queueLaunchSleepLink(path);
    else queueSleepLinkAction(action);
    return '/';
  } catch {
    return path;
  }
}
