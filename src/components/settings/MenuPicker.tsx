// ios: compact value + chevron that opens an action sheet, matching the
// original settings rows.
import { ActionSheetIOS, Text } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { playHaptic } from '@/services/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { RowLabel, SettingsRow, settingsStyles } from './SettingsList';

export interface MenuPickerProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  title: string;
  onChange: (value: T) => void;
  separator?: boolean;
  testID?: string;
}

export function MenuPicker<T extends string>({
  label,
  value,
  options,
  labels,
  title,
  onChange,
  separator,
  testID,
}: MenuPickerProps<T>) {
  const theme = useTheme();
  return (
    <SettingsRow
      testID={testID}
      separator={separator}
      accessibilityLabel={`${label}, ${labels[value]}`}
      onPress={() => {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: [...options.map((item) => labels[item]), 'Cancel'],
            cancelButtonIndex: options.length,
            title,
          },
          (index) => {
            if (index != null && index < options.length) {
              playHaptic('selection');
              onChange(options[index]);
            }
          }
        );
      }}>
      <RowLabel color={theme.textPrimary}>{label}</RowLabel>
      <Text style={settingsStyles.value} numberOfLines={1}>
        {labels[value]}
      </Text>
      <NativeSymbol name="chevron.up.chevron.down" size={12} tintColor="#98989f" />
    </SettingsRow>
  );
}
