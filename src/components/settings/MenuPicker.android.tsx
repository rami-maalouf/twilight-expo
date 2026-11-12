// android: the row shows the value and a chevron like ios and opens a
// material 3 single-choice menu anchored at the value. the whole row is the
// touch target (ripple); the universal Picker renders a ~280dp exposed
// dropdown text field that overflows a settings row, so the row composes the
// menu here.
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/dropdownmenu/
import {
  Box,
  DropdownMenuGroup,
  DropdownMenuPopup,
  Host,
  SelectableDropdownMenuItem,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
import { playHaptic } from '@/services/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { RowLabel, SettingsRow, settingsStyles } from './SettingsList';
import type { MenuPickerProps } from './MenuPicker';

export function MenuPicker<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
  separator,
  testID,
}: MenuPickerProps<T>) {
  const theme = useTheme();
  const isLight = theme.name === 'sunset';
  const [expanded, setExpanded] = useState(false);

  return (
    <SettingsRow
      testID={testID}
      separator={separator}
      accessibilityLabel={`${label}, ${labels[value]}`}
      accessibilityHint="Opens a menu"
      onPress={() => setExpanded(true)}>
      <RowLabel color={theme.textPrimary}>{label}</RowLabel>
      <View style={styles.trailing}>
        <Text style={settingsStyles.value} numberOfLines={1}>
          {labels[value]}
        </Text>
        <NativeSymbol name="chevron.up.chevron.down" size={14} tintColor="#98989f" />
        {/* the compose host only anchors the menu under the value, so the
            value stays plain text that can truncate before the chevron */}
        <Host style={styles.menuAnchor} colorScheme={isLight ? 'light' : 'dark'} seedColor={theme.accent} pointerEvents="none">
          <Box>
            <DropdownMenuPopup expanded={expanded} onDismissRequest={() => setExpanded(false)}>
              <DropdownMenuGroup>
                {options.map((item, index) => (
                  <SelectableDropdownMenuItem
                    key={item}
                    selected={item === value}
                    shapes={{ index, count: options.length }}
                    onClick={() => {
                      setExpanded(false);
                      if (item !== value) {
                        // swift: UIImpactFeedbackGenerator(.medium) on change
                        playHaptic('selection');
                        onChange(item);
                      }
                    }}>
                    <SelectableDropdownMenuItem.Text>
                      <ComposeText>{labels[item]}</ComposeText>
                    </SelectableDropdownMenuItem.Text>
                  </SelectableDropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuPopup>
          </Box>
        </Host>
      </View>
    </SettingsRow>
  );
}

const styles = StyleSheet.create({
  // the value may shrink (ellipsis) but never pushes the chevron off the row
  trailing: { flexShrink: 1, maxWidth: '60%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuAnchor: { position: 'absolute', left: 0, bottom: 0, width: 1, height: 1 },
});
