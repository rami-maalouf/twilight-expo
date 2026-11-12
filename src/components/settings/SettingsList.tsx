// grouped settings list (swift Form / insetGrouped List): a section is one
// rounded block that clips its rows, so only the first row has rounded top
// corners and only the last row rounded bottom corners, and a row's ripple
// follows the block's shape. rows draw an inset hairline under themselves
// when another row follows.
import type { ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableFeedback } from '@/components/common/PressableFeedback';
import { useTheme } from '@/theme/ThemeProvider';

const IS_ANDROID = Platform.OS === 'android';
// ios inset grouped lists use 10; material 3 list containers use a larger
// corner (android 16 settings groups are 20+)
export const SECTION_RADIUS = IS_ANDROID ? 16 : 10;

// ios secondaryLabel: the dark value on night sky rows, the light one on
// sunset rows (the dark gray reads at ~2.6:1 there)
export function useSecondaryLabel(): string {
  const theme = useTheme();
  return theme.name === 'sunset' ? 'rgba(60, 60, 67, 0.6)' : '#98989f';
}

export function useRowBackground(): string {
  const theme = useTheme();
  return theme.name === 'sunset' ? 'rgba(255, 255, 255, 0.75)' : '#1c1c1e';
}

export function SettingsSection({
  title,
  footer,
  children,
  testID,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const rowBg = useRowBackground();
  return (
    <View testID={testID}>
      {title ? (
        <Text style={[styles.header, { color: theme.textSecondary }]} accessibilityRole="header">
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.block, { backgroundColor: rowBg }]}>{children}</View>
      {footer ? <Text style={[styles.footer, { color: theme.textSecondary }]}>{footer}</Text> : null}
    </View>
  );
}

export interface SettingsRowProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  // draw the inset hairline under this row (another row follows)
  separator?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityRole?: 'button' | 'link' | 'switch';
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { checked?: boolean; disabled?: boolean; busy?: boolean };
}

export function SettingsRow({
  children,
  onPress,
  onLongPress,
  disabled,
  separator,
  style,
  testID,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
}: SettingsRowProps) {
  const body = (
    <>
      <View style={[styles.row, style]}>{children}</View>
      {separator ? <View style={styles.separator} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <PressableFeedback
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}>
      {body}
    </PressableFeedback>
  );
}

// label + flexible gap + trailing content, with the label allowed to wrap
// and the trailing part never pushed out of the row
export function RowLabel({ children, color, style }: { children: ReactNode; color: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Text style={[styles.label, { color }, style]} numberOfLines={2}>
      {children}
    </Text>
  );
}

export const settingsStyles = StyleSheet.create({
  trailing: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { fontSize: 17, flexShrink: 1 },
  description: { fontSize: 12, marginTop: 2 },
});

const styles = StyleSheet.create({
  header: { fontSize: 13, marginBottom: 6, marginLeft: 16 },
  footer: { fontSize: 13, marginTop: 6, marginHorizontal: 16 },
  block: { borderRadius: SECTION_RADIUS, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: IS_ANDROID ? 56 : 44,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
    backgroundColor: 'rgba(84, 84, 88, 0.6)',
  },
  label: { fontSize: 17, flexShrink: 1, flexGrow: 1 },
});
