// renders nothing: mounts the android home-screen widget sync inside
// ThemeProvider (display mode and palette live in its context)
import { useHomeWidgetSync } from '@/services/use-home-widget-sync';

export function HomeWidgetSync() {
  useHomeWidgetSync();
  return null;
}
