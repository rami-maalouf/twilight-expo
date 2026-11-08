// android: compact value + chevron (same row as ios) anchoring a material 3
// single-choice menu. the universal Picker renders a ~280dp exposed dropdown
// text field that overflows a settings row, so the row composes the menu here.
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/dropdownmenu/
import {
  Box,
  DropdownMenuGroup,
  DropdownMenuPopup,
  Host,
  RNHostView,
  SelectableDropdownMenuItem,
  Text as ComposeText,
} from '@expo/ui/jetpack-compose';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { NativeSymbol } from '@/components/common/NativeSymbol';
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
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.row, { backgroundColor: rowBg }, style]}>
      <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{label}</Text>
      <View style={styles.spacer} />
      <Host matchContents colorScheme={isLight ? 'light' : 'dark'} seedColor={theme.accent}>
        <Box>
          <RNHostView matchContents>
            <Pressable
              testID={testID}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${labels[value]}`}
              onPress={() => setExpanded(true)}
              style={styles.trigger}>
              <Text style={styles.rowValue}>{labels[value]}</Text>
              <NativeSymbol name="chevron.up.chevron.down" size={14} tintColor="#98989f" />
            </Pressable>
          </RNHostView>
          <DropdownMenuPopup expanded={expanded} onDismissRequest={() => setExpanded(false)}>
            <DropdownMenuGroup>
              {options.map((item, index) => (
                <SelectableDropdownMenuItem
                  key={item}
                  selected={item === value}
                  shapes={{ index, count: options.length }}
                  onClick={() => {
                    setExpanded(false);
                    if (item !== value) onChange(item);
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
  trigger: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
});
