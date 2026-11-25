// toolbar back control for pushed screens: the material 3 "arrow_back" icon
// button (48dp target, circular ripple) on android, swift's chevron.left
// navigation back button on ios
import { Platform, StyleSheet } from 'react-native';

import { IconButton, type IconButtonEdge } from './IconButton';
import { NativeSymbol } from './NativeSymbol';

const ICON_SIZE = 24;

export function BackButton({
  color,
  onPress,
  disabled,
  edge,
  testID,
}: {
  color: string;
  onPress: () => void;
  disabled?: boolean;
  edge?: IconButtonEdge;
  testID?: string;
}) {
  return (
    <IconButton
      accessibilityLabel="Back"
      onPress={onPress}
      disabled={disabled}
      iconSize={ICON_SIZE}
      edge={edge}
      testID={testID}
      style={disabled ? styles.disabled : undefined}>
      <NativeSymbol name={Platform.OS === 'android' ? 'arrow.left' : 'chevron.left'} size={ICON_SIZE} tintColor={color} />
    </IconButton>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.38 },
});
