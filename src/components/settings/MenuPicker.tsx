// ios: compact value + chevron that opens an action sheet, matching the
// original settings rows.
import * as Haptics from 'expo-haptics';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { useTheme } from '@/theme/ThemeProvider';

export function MenuPicker<T extends string>({
  label,
  value,
  options,
  labels,
  title,
  onChange,
  rowBg,
  style,
  testID,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  title: string;
  onChange: (value: T) => void;
  rowBg: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: [...options.map((item) => labels[item]), 'Cancel'],
            cancelButtonIndex: options.length,
            title,
          },
          (index) => {
            if (index != null && index < options.length) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onChange(options[index]);
            }
          }
        );
      }}>
      <View style={[styles.row, { backgroundColor: rowBg }, style]}>
        <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
        <View style={styles.spacer} />
        <Text style={styles.rowValue}>{labels[value]}</Text>
        <NativeSymbol name="chevron.up.chevron.down" size={12} tintColor="#98989f" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  rowLabel: { fontSize: 17 },
  rowValue: { fontSize: 17, color: '#98989f' },
  spacer: { flex: 1 },
});
