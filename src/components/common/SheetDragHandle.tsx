// the material 3 bottom sheet drag handle (32x4dp, 22dp above and below).
// react-native-screens draws ios' grabber (sheetGrabberVisible) but not an
// android one, so android sheets draw it themselves. ios renders nothing.
import { Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function SheetDragHandle() {
  const theme = useTheme();
  if (Platform.OS !== 'android') return null;
  return (
    <View style={styles.area} accessible={false} importantForAccessibility="no">
      <View style={[styles.handle, { backgroundColor: theme.textSecondary }]} />
    </View>
  );
}

// top padding of a sheet's toolbar: ios clears the sheet's safe area; on
// android the drag handle above already spaces it from the sheet edge
export function sheetToolbarTop(insetTop: number): number {
  return Platform.OS === 'android' ? 0 : insetTop + 14;
}

const styles = StyleSheet.create({
  area: { alignItems: 'center', paddingVertical: 22 },
  handle: { width: 32, height: 4, borderRadius: 2, opacity: 0.4 },
});
