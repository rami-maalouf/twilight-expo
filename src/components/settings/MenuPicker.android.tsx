// android: material dropdown via universal @expo/ui Picker.
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/universal/picker/
import { Host, Picker } from '@expo/ui';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function MenuPicker<T extends string>({
  label,
  value,
  options,
  labels,
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
  const isLight = theme.name === 'sunset';
  return (
    <View style={[styles.row, { backgroundColor: rowBg }, style]}>
      <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
      <View style={styles.spacer} />
      <Host
        matchContents
        testID={testID}
        colorScheme={isLight ? 'light' : 'dark'}
        seedColor={theme.accent}>
        <Picker selectedValue={value} onValueChange={onChange} appearance="menu">
          {options.map((item) => (
            <Picker.Item key={item} label={labels[item]} value={item} />
          ))}
        </Picker>
      </Host>
    </View>
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
  spacer: { flex: 1 },
});
