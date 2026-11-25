// shared screen layout metrics
import { Platform } from 'react-native';

// top padding of a tab screen's scroll content: the safe-area inset plus the
// gap above the large title (ios matches the old fixed 70 on a dynamic island
// phone; android leaves m3's 16dp under the status bar)
export function tabContentTop(insetTop: number): number {
  return insetTop + (Platform.OS === 'android' ? 16 : 12);
}
