// ports Components/Common/CustomToggle.swift: title + caption description
// with a trailing switch, disabled (but still showing its value) while a
// sleep session is active. on android the whole row toggles the switch and
// is announced as one switch; on ios only the switch toggles, like swift.
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SettingsRow, settingsStyles } from './SettingsList';
import { SettingsSwitch, SWITCH_ROW_TOGGLES } from './SettingsSwitch';

export function SettingsSwitchRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
  separator,
  testID,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  separator?: boolean;
  testID?: string;
}) {
  const theme = useTheme();
  const texts = (
    <View style={styles.texts}>
      <Text style={[styles.title, { color: theme.textPrimary }, disabled && styles.disabledText]}>{title}</Text>
      <Text style={settingsStyles.description}>{description}</Text>
    </View>
  );
  const control = (
    <SettingsSwitch
      testID={testID}
      value={value}
      disabled={disabled}
      accessibilityLabel={title}
      onValueChange={onValueChange}
    />
  );
  return (
    <SettingsRow
      separator={separator}
      disabled={disabled}
      onPress={SWITCH_ROW_TOGGLES ? () => onValueChange(!value) : undefined}
      testID={SWITCH_ROW_TOGGLES && testID ? `${testID}-row` : undefined}
      accessibilityRole="switch"
      accessibilityLabel={SWITCH_ROW_TOGGLES ? title : undefined}
      accessibilityState={{ checked: value, disabled: !!disabled }}>
      {texts}
      {control}
    </SettingsRow>
  );
}

const styles = StyleSheet.create({
  texts: { flex: 1, paddingRight: 8 },
  title: { fontSize: 17 },
  disabledText: { opacity: 0.5 },
});
