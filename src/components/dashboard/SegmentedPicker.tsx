// native segmented control on both platforms via @expo/ui:
// ios: SwiftUI Picker with pickerStyle('segmented')
// android: Compose SingleChoiceSegmentedButtonRow
// source: https://docs.expo.dev/versions/v57.0.0/sdk/ui/drop-in-replacements/segmentedcontrol/
import { SegmentedControl } from '@expo/ui/community/segmented-control';

import { useTheme } from '@/theme/ThemeProvider';

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
  const isLight = theme.name === 'sunset';
  const selectedIndex = Math.max(0, options.indexOf(value));
  return (
    <SegmentedControl
      values={[...options]}
      selectedIndex={selectedIndex}
      onValueChange={(next) => {
        if (options.includes(next as T)) onChange(next as T);
      }}
      appearance={isLight ? 'light' : 'dark'}
      tintColor={theme.actionPrimary}
      testID={testIDPrefix}
      style={{ alignSelf: 'stretch', width: '100%', height: 36 }}
    />
  );
}
