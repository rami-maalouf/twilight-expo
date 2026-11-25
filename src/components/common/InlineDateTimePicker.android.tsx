// android has no compact inline picker, so the value shows as a chip (with a
// ripple and a "Bedtime, 10:00 PM" content description) that opens a jetpack
// compose material 3 dialog on demand: a titled time picker dialog in the
// device's 12/24-hour format, or the m3 date picker dialog. both follow the
// app's light/dark mode and use the palette accent, unlike the legacy
// platform dialogs (teal accent, no titles).
// source: https://docs.expo.dev/versions/v58.0.0/sdk/ui/jetpack-compose/datetimepicker/
import { AlertDialog, DatePickerDialog, DateTimePicker, Host, Text as ComposeText, TextButton } from '@expo/ui/jetpack-compose';
import { useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { deviceClock, formatShortDate, formatTime } from '@/utils/locale-format';
import { fromPickerDay, toPickerDayMillis } from '@/utils/picker-dates';
import { PressableFeedback } from './PressableFeedback';
import type { InlineDateTimePickerProps } from './InlineDateTimePicker';

export function InlineDateTimePicker({
  value,
  mode,
  themeVariant,
  accentColor,
  title,
  onValueChange,
  style,
  testID,
}: InlineDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const draft = useRef<Date | null>(null);
  const isLight = themeVariant === 'light';
  const accent = accentColor ?? (isLight ? '#2d1b2e' : '#00d4ff');
  const dialogTitle = title ?? (mode === 'time' ? 'Select time' : 'Select date');
  const label = mode === 'time' ? formatTime(value.getTime()) : formatShortDate(value);

  const close = () => {
    draft.current = null;
    setOpen(false);
  };

  return (
    <>
      <PressableFeedback
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${dialogTitle}, ${label}`}
        onPress={() => setOpen(true)}
        style={[styles.chip, { backgroundColor: isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)' }, style]}>
        <Text style={[styles.chipLabel, { color: isLight ? '#1c1c1e' : '#ffffff' }]}>{label}</Text>
      </PressableFeedback>
      {open ? (
        <Host style={styles.anchor} colorScheme={isLight ? 'light' : 'dark'} seedColor={accent}>
          {mode === 'time' ? (
            <AlertDialog onDismissRequest={close}>
              <AlertDialog.Title>
                <ComposeText style={{ typography: 'labelLarge' }}>{dialogTitle}</ComposeText>
              </AlertDialog.Title>
              <AlertDialog.Text>
                <DateTimePicker
                  displayedComponents="hourAndMinute"
                  initialDate={value.toISOString()}
                  is24Hour={deviceClock().hour12 === false}
                  color={accent}
                  onDateSelected={(date) => {
                    draft.current = date;
                  }}
                />
              </AlertDialog.Text>
              <AlertDialog.ConfirmButton>
                <TextButton
                  colors={{ contentColor: accent }}
                  onClick={() => {
                    const picked = draft.current;
                    close();
                    if (picked) onValueChange(picked);
                  }}>
                  <ComposeText>OK</ComposeText>
                </TextButton>
              </AlertDialog.ConfirmButton>
              <AlertDialog.DismissButton>
                <TextButton colors={{ contentColor: accent }} onClick={close}>
                  <ComposeText>Cancel</ComposeText>
                </TextButton>
              </AlertDialog.DismissButton>
            </AlertDialog>
          ) : (
            <DatePickerDialog
              initialDate={new Date(toPickerDayMillis(value)).toISOString()}
              color={accent}
              confirmButtonLabel="OK"
              dismissButtonLabel="Cancel"
              onDateSelected={(date) => {
                close();
                if (date) onValueChange(fromPickerDay(date));
              }}
              onDismissRequest={close}
            />
          )}
        </Host>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  // the dialog opens in its own window; the host only anchors it
  anchor: { position: 'absolute', width: 1, height: 1 },
});
