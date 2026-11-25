// ios: the native compact date/time picker, matching the original's .compact
// style (DatePicker with .labelsHidden()). android: InlineDateTimePicker.android.tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import type { StyleProp, ViewStyle } from 'react-native';

export interface InlineDateTimePickerProps {
  value: Date;
  mode: 'date' | 'time';
  themeVariant: 'light' | 'dark';
  accentColor?: string;
  // dialog title on android ("Bedtime", "Wake Up"); ios has no dialog
  title?: string;
  onValueChange: (date: Date) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function InlineDateTimePicker({
  value,
  mode,
  themeVariant,
  accentColor,
  onValueChange,
  style,
  testID,
}: InlineDateTimePickerProps) {
  return (
    <DateTimePicker
      testID={testID}
      value={value}
      mode={mode}
      display="compact"
      themeVariant={themeVariant}
      accentColor={accentColor}
      onValueChange={(_, date) => onValueChange(date)}
      style={style}
    />
  );
}
