// icon-only toolbar button. android: a material 3 icon button touch target
// (48dp, icon centered) with an unbounded circular ripple; negative vertical
// margins keep the row height of the icon alone, and a button at the start
// or end of a row also hangs into that padding so the icon stays where it was. ios
// keeps the icon's own frame and a hit slop, so its layout does not change.
import { Platform, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { PressableFeedback } from './PressableFeedback';

const IS_ANDROID = Platform.OS === 'android';
export const ICON_TARGET = 48;

export type IconButtonEdge = 'start' | 'end';

export function iconButtonInsets(iconSize: number, edge?: IconButtonEdge): ViewStyle {
  const overhang = -Math.max(0, (ICON_TARGET - iconSize) / 2);
  if (edge === 'start') return { marginVertical: overhang, marginLeft: overhang };
  if (edge === 'end') return { marginVertical: overhang, marginRight: overhang };
  return { marginVertical: overhang };
}

export function IconButton({
  accessibilityLabel,
  onPress,
  children,
  iconSize,
  edge,
  testID,
  style,
}: {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
  iconSize: number;
  edge?: IconButtonEdge;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableFeedback
      kind="icon"
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={IS_ANDROID ? undefined : 8}
      style={[IS_ANDROID && [styles.target, iconButtonInsets(iconSize, edge)], style]}>
      {children}
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  target: { width: ICON_TARGET, height: ICON_TARGET, alignItems: 'center', justifyContent: 'center' },
});
