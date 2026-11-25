// android: a jetpack compose material 3 switch (larger thumb, outlined track
// when off, m3 disabled colors) tinted from the palette accent like swift's
// CustomToggle. the whole row toggles it (SWITCH_ROW_TOGGLES), so the compose
// switch itself has no click handler and is hidden from accessibility: the
// row is announced as one "switch, on/off" with its title.
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/switch/
import { Host, Switch } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { switchColors } from './switch-colors';

export interface SettingsSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
}

export const SWITCH_ROW_TOGGLES = true;

export function SettingsSwitch({ value, disabled, testID }: SettingsSwitchProps) {
  const theme = useTheme();
  const isLight = theme.name === 'sunset';
  return (
    <View
      testID={testID}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      pointerEvents="none">
      <Host matchContents colorScheme={isLight ? 'light' : 'dark'}>
        <Switch value={value} enabled={!disabled} colors={switchColors(theme.accent, isLight)} />
      </Host>
    </View>
  );
}
