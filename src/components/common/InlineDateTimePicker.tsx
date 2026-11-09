// platform-guarded compact date/time picker.
// ios: the native inline compact picker, matching the original's .compact style.
// android: display="compact" does not exist - a mounted picker opens its modal
// dialog immediately (all of them at boot, since native tabs mount eagerly),
// so render a pressable value chip that opens the system dialog on demand.
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  value: Date;
  mode: 'date' | 'time';
  themeVariant: 'light' | 'dark';
  accentColor?: string;
  title?: string;
  onValueChange: (date: Date) => void;
  style?: StyleProp<ViewStyle>;
}

function label(value: Date, mode: 'date' | 'time'): string {
  if (mode === 'time') {
    return value.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function InlineDateTimePicker({
  value,
  mode,
  themeVariant,
  accentColor,
  title,
  onValueChange,
  style,
}: Props) {
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        themeVariant={themeVariant}
        accentColor={accentColor}
        onChange={(_, date) => {
          if (date) onValueChange(date);
        }}
        style={style}
      />
    );
  }
  const isLight = themeVariant === 'light';
  const chipBg = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
  const chipText = isLight ? '#1c1c1e' : '#ffffff';
  const effectiveTitle = title ?? (mode === 'time' ? 'Select time' : 'Select date');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${effectiveTitle}, ${label(value, mode)}`}
      android_ripple={{
        color: isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.2)',
        borderless: false,
      }}
      style={[styles.chip, { backgroundColor: chipBg }, style]}
      onPress={() =>
        DateTimePickerAndroid.open({
          value,
          mode,
          design: 'material',
          title: effectiveTitle,
          positiveButton: accentColor ? { textColor: accentColor } : undefined,
          negativeButton: accentColor ? { textColor: accentColor } : undefined,
          onChange: (_, date) => {
            if (date) onValueChange(date);
          },
        })
      }
    >
      <Text style={[styles.chipLabel, { color: chipText }]}>{label(value, mode)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
    overflow: 'hidden',
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
});
