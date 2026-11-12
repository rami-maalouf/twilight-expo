// ios: the native UISwitch tinted with the palette accent, like swift's
// CustomToggle (.tint(themeManager.themeColor)). the row itself is not
// tappable on ios, matching the swift Toggle row.
import { Switch } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export interface SettingsSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

// ios toggles only through the switch, so the row does not handle taps
export const SWITCH_ROW_TOGGLES = false;

export function SettingsSwitch({ value, onValueChange, disabled, accessibilityLabel, testID }: SettingsSwitchProps) {
  const theme = useTheme();
  return (
    <Switch
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      value={value}
      disabled={disabled}
      onValueChange={onValueChange}
      trackColor={{ true: theme.accent }}
    />
  );
}
