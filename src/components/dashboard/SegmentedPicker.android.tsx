// android: native Material 3 SegmentedButton, colored from the app palette.
// inactive segments use a solid track fill (same family as cards / actionSecondary)
// and matching border colors so Material's outline stroke does not read as an
// empty wireframe. selected uses actionPrimary.
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/segmentedbutton/
import {
  Host,
  SegmentedButton,
  SingleChoiceSegmentedButtonRow,
  Text,
} from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useIsDesaturated, useTheme } from '@/theme/ThemeProvider';
import type { AppTheme } from '@/theme/palettes';

// solid fills Material can paint (prefer hex over rgba for Compose Color)
function trackFill(theme: AppTheme, isDesaturated: boolean): string {
  if (isDesaturated) return theme.actionSecondary;
  if (theme.name === 'sunset') return '#F5E6E0';
  if (theme.name === 'amethyst') return '#3d426b';
  return '#2a2a4a';
}

function segmentedColors(theme: AppTheme, isDesaturated: boolean) {
  const track = trackFill(theme, isDesaturated);
  const activeContainer = isDesaturated ? '#333333' : theme.actionPrimary;
  return {
    activeContainerColor: activeContainer,
    activeContentColor: '#ffffff',
    activeBorderColor: activeContainer,
    inactiveContainerColor: track,
    inactiveContentColor: theme.name === 'sunset' ? theme.textPrimary : theme.textSecondary,
    inactiveBorderColor: track,
  };
}

export function SegmentedPicker<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  testIDPrefix?: string;
}) {
  const theme = useTheme();
  const isDesaturated = useIsDesaturated();
  const isLight = theme.name === 'sunset';
  const colors = segmentedColors(theme, isDesaturated);

  return (
    <View testID={testIDPrefix} style={{ alignSelf: 'stretch', width: '100%' }}>
      <Host
        matchContents={{ vertical: true }}
        colorScheme={isLight ? 'light' : 'dark'}
        seedColor={theme.actionPrimary}
        style={{ alignSelf: 'stretch', width: '100%', minHeight: 40 }}>
        <SingleChoiceSegmentedButtonRow>
          {options.map((option) => (
            <SegmentedButton
              key={option}
              selected={option === value}
              onClick={() => onChange(option)}
              colors={colors}>
              <SegmentedButton.Label>
                <Text
                  color={
                    option === value
                      ? String(colors.activeContentColor)
                      : String(colors.inactiveContentColor)
                  }
                  style={{ typography: 'labelMedium', fontWeight: '600' }}>
                  {option}
                </Text>
              </SegmentedButton.Label>
            </SegmentedButton>
          ))}
        </SingleChoiceSegmentedButtonRow>
      </Host>
    </View>
  );
}
