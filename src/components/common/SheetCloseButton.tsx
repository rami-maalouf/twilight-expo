// the close control of a sheet or modal toolbar: an "X" material 3 icon
// button on android, swift's "Done" / "Cancel" text button on ios
import { Platform, StyleSheet, Text } from 'react-native';

import { NativeSymbol } from './NativeSymbol';
import { IconButton, type IconButtonEdge } from './IconButton';
import { PressableFeedback } from './PressableFeedback';

export function SheetCloseButton({
  onPress,
  iconColor,
  doneColor,
  label = 'Done',
  edge = 'end',
  testID,
}: {
  onPress: () => void;
  iconColor: string;
  doneColor: string;
  // the ios text ("Done", "Cancel")
  label?: string;
  // which end of the toolbar it sits at
  edge?: IconButtonEdge;
  testID?: string;
}) {
  if (Platform.OS === 'android') {
    return (
      <IconButton testID={testID} accessibilityLabel="Close" onPress={onPress} iconSize={24} edge={edge}>
        <NativeSymbol name="xmark" size={22} tintColor={iconColor} />
      </IconButton>
    );
  }
  return (
    <PressableFeedback
      testID={testID}
      onPress={onPress}
      hitSlop={12}
      style={[styles.done, edge === 'start' && styles.leading]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Text style={[styles.doneText, edge === 'start' && styles.leadingText, { color: doneColor }]}>{label}</Text>
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  done: { minWidth: 48, alignItems: 'flex-end' },
  leading: { alignItems: 'flex-start' },
  doneText: { fontSize: 17, fontWeight: '600' },
  // swift's cancellation action is regular weight
  leadingText: { fontWeight: '400' },
});
